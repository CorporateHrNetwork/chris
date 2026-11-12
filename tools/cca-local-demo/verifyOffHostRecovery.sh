#!/usr/bin/env bash
# Restore the fictional CHRiS archive into a fresh PostgreSQL cluster.
set -euo pipefail
umask 077
if [[ $# -lt 3 || $# -gt 4 || ( $# -eq 4 && "$4" != "--with-chris" ) ]]; then
  echo "Usage: bash $0 <archive.cms> <recipient-certificate.pem> <private-key.pem> [--with-chris]" >&2
  exit 2
fi

lab=$(mktemp -d /tmp/cca-recovery.XXXXXXXX)
cleanup() {
  if [[ -f "$lab/data/postmaster.pid" ]]; then
    pg_ctl -D "$lab/data" -m fast -w stop >/dev/null || {
      echo "Could not stop the recovery server. Its private directory is $lab." >&2
      return 1
    }
  fi
  rm -rf -- "$lab"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for variable in ${!PG@}; do unset "$variable"; done
export PGHOST=127.0.0.1 PGPORT=55435 PGPASSFILE="$lab/pgpass" LC_ALL=C
openssl cms -decrypt -binary -inform DER -in "$1" -recip "$2" -inkey "$3" -out "$lab/payload"
if [[ "$(od -An -tx1 -N2 "$lab/payload" | tr -d ' \n')" == 1f8b ]]; then
  gzip -dc "$lab/payload" > "$lab/chris.dump"
else
  mv -- "$lab/payload" "$lab/chris.dump"
fi

admin_password=$(openssl rand -hex 24)
app_password=$(openssl rand -hex 24)
printf '%s\n' "$admin_password" > "$lab/init-password"
printf '*:*:*:cca_recovery_admin:%s\n*:*:*:chris_staging_app:%s\n' "$admin_password" "$app_password" > "$PGPASSFILE"
initdb -D "$lab/data" -U cca_recovery_admin --auth=scram-sha-256 --pwfile="$lab/init-password" >/dev/null
rm -- "$lab/init-password"
unset admin_password
if ! pg_ctl -D "$lab/data" -l "$lab/postgres.log" \
  -o "-c listen_addresses=$PGHOST -c port=$PGPORT -c unix_socket_directories=''" -w start >/dev/null; then
  cat "$lab/postgres.log" >&2
  exit 1
fi
psql -X -w -v ON_ERROR_STOP=1 -U cca_recovery_admin -d postgres >/dev/null <<SQL
CREATE ROLE chris_staging_app LOGIN PASSWORD '$app_password';
CREATE ROLE cca_staging_admin NOLOGIN;
CREATE DATABASE chris_recovered;
REVOKE CONNECT ON DATABASE postgres, template0, template1, chris_recovered FROM PUBLIC;
GRANT CONNECT ON DATABASE chris_recovered TO chris_staging_app;
SQL
unset app_password
pg_restore -w --exit-on-error --single-transaction -U cca_recovery_admin -d chris_recovered "$lab/chris.dump"
[[ "$(psql -X -w -At -v ON_ERROR_STOP=1 -U chris_staging_app -d chris_recovered -c 'SELECT label FROM pilot_record')" == fictional-chris-staging ]]
echo "PASS: Encrypted CHRiS archive restored to a new cluster and read using a freshly provisioned application role."

if [[ ${4:-} == "--with-chris" ]]; then
  recovered=$(psql -X -w -At -v ON_ERROR_STOP=1 -U chris_staging_app -d chris_recovered <<'SQL'
SELECT o.slug || '|' || e."employeeNumber" || '|' || l.name || '|' || d.name
FROM employees e
JOIN organizations o ON o.id = e."organizationId"
JOIN organization_locations l ON l.id = e."locationId" AND l."organizationId" = o.id
JOIN departments d ON d.id = e."departmentId" AND d."organizationId" = o.id
WHERE o.slug IN ('cca-fictional-chris-staging', 'cca-fictional-other')
ORDER BY e."employeeNumber";
SQL
)
  expected=$(cat <<'EOF'
cca-fictional-chris-staging|CCA-101|Cedar Gate|Fictional Operations
cca-fictional-chris-staging|CCA-102|North Wharf|Fictional Operations
cca-fictional-chris-staging|CCA-103|Cedar Gate|Fictional Operations
cca-fictional-other|CCA-201|Harbour Annex|Fictional Operations
EOF
)
  [[ "$recovered" == "$expected" ]]
  access=$(psql -X -w -At -v ON_ERROR_STOP=1 -U chris_staging_app -d chris_recovered <<'SQL'
SELECT p.key
FROM users u JOIN organizations o ON o.id = u."organizationId"
JOIN user_roles ur ON ur."userId" = u.id
JOIN role_permissions rp ON rp."roleId" = ur."roleId"
JOIN permissions p ON p.id = rp."permissionId"
WHERE o.slug = 'cca-fictional-chris-staging' AND u.email = 'operator@example.invalid';
SQL
)
  [[ "$access" == "employees.view" ]]
  echo "PASS: Recovered 4 fictional employees across 2 organizations and 3 branches, with department links and operator access grants."
fi
