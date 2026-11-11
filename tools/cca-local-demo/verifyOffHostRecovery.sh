#!/usr/bin/env bash
# Restore the fictional CHRiS archive into a fresh PostgreSQL cluster.
set -euo pipefail
umask 077
if [[ $# -ne 3 ]]; then
  echo "Usage: bash $0 <archive.cms> <recipient-certificate.pem> <private-key.pem>" >&2
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
openssl cms -decrypt -binary -inform DER -in "$1" -recip "$2" -inkey "$3" -out "$lab/chris.dump"

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
