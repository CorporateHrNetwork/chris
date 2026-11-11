#!/usr/bin/env bash
# Run only against a fresh, disposable PostgreSQL cluster on this machine.
set -euo pipefail
umask 077

for program in initdb pg_ctl psql pg_dump pg_restore gpg openssl; do
  command -v "$program" >/dev/null || { echo "Missing prerequisite: $program" >&2; exit 1; }
done

lab=$(mktemp -d /tmp/cca-db.XXXXXXXX)
cleanup() {
  if [[ -f "$lab/data/postmaster.pid" ]]; then
    pg_ctl -D "$lab/data" -m fast -w stop >/dev/null || {
      echo "Could not stop the test server. Its private directory is $lab." >&2
      return 1
    }
  fi
  rm -rf -- "$lab"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Clear inherited PostgreSQL settings so the rehearsal can only use this cluster.
for variable in ${!PG@}; do unset "$variable"; done
export PGHOST="$lab" PGPORT=5432
mkdir "$lab/gnupg"
export GNUPGHOME="$lab/gnupg"

initdb -D "$lab/data" -U cca_pilot_admin --auth-local=trust --auth-host=scram-sha-256 >/dev/null
# The socket directory is owner-only. Give demo roles password authentication.
cat > "$lab/data/pg_hba.conf" <<'HBA'
local all cca_pilot_admin trust
local all all scram-sha-256
HBA
pg_ctl -D "$lab/data" -l "$lab/postgres.log" -o "-c listen_addresses='' -c unix_socket_directories=$lab -c unix_socket_permissions=0700" -w start >/dev/null

admin() {
  psql -X -v ON_ERROR_STOP=1 -U cca_pilot_admin "$@"
}
connect_as() {
  psql -X -w -At -v ON_ERROR_STOP=1 -U "$1" -d "$2" -c "$3"
}
expect_denied() {
  local pattern=$1
  shift
  if connect_as "$@" >"$lab/denied.log" 2>&1 || ! grep -Fq "$pattern" "$lab/denied.log"; then
    echo "Expected access denial for $1 on $2" >&2
    exit 1
  fi
}
expect_value() {
  local expected=$1
  shift
  [[ "$(connect_as "$@")" == "$expected" ]]
}

chris_password=$(openssl rand -hex 24)
cedar_password=$(openssl rand -hex 24)
admin -d postgres >/dev/null <<SQL
CREATE ROLE chris_staging_app LOGIN PASSWORD '$chris_password';
CREATE ROLE cedar_pilot_app LOGIN PASSWORD '$cedar_password';
CREATE DATABASE chris_staging;
CREATE DATABASE cedar_pilot;
REVOKE CONNECT ON DATABASE postgres, template0, template1, chris_staging, cedar_pilot FROM PUBLIC;
GRANT CONNECT ON DATABASE chris_staging TO chris_staging_app;
GRANT CONNECT ON DATABASE cedar_pilot TO cedar_pilot_app;
SQL
printf '*:*:*:chris_staging_app:%s\n*:*:*:cedar_pilot_app:%s\n' "$chris_password" "$cedar_password" > "$lab/pgpass"
export PGPASSFILE="$lab/pgpass"
unset chris_password cedar_password

for database in chris_staging cedar_pilot; do
  admin -d "$database" >/dev/null <<SQL
CREATE TABLE pilot_record (label text NOT NULL);
INSERT INTO pilot_record VALUES ('$database');
GRANT SELECT ON pilot_record TO ${database}_app;
SQL
done

expect_value chris_staging chris_staging_app chris_staging 'SELECT label FROM pilot_record'
expect_value cedar_pilot cedar_pilot_app cedar_pilot 'SELECT label FROM pilot_record'
expect_denied 'permission denied for database' cedar_pilot_app chris_staging 'SELECT label FROM pilot_record'
expect_denied 'permission denied for database' chris_staging_app cedar_pilot 'SELECT label FROM pilot_record'
echo "PASS: CHRiS and Cedar database access is isolated"

admin -d postgres >/dev/null <<'SQL'
ALTER ROLE cedar_pilot_app NOLOGIN;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'cedar_pilot_app';
SQL
expect_denied 'is not permitted to log in' cedar_pilot_app cedar_pilot 'SELECT 1'
expect_value chris_staging chris_staging_app chris_staging 'SELECT label FROM pilot_record'
echo "PASS: Cedar suspension leaves CHRiS available"

openssl rand -hex 32 > "$lab/backup-key"
backup_cipher() {
  gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$lab/backup-key" "$@"
}
pg_dump -U cca_pilot_admin --format=custom chris_staging |
  backup_cipher --symmetric --cipher-algo AES256 --output "$lab/chris.dump.gpg"
admin -d postgres >/dev/null <<'SQL'
CREATE DATABASE chris_restore;
REVOKE CONNECT ON DATABASE chris_restore FROM PUBLIC;
SQL
backup_cipher --decrypt "$lab/chris.dump.gpg" |
  pg_restore -U cca_pilot_admin --exit-on-error --dbname=chris_restore
[[ "$(admin -At -d chris_restore -c 'SELECT label FROM pilot_record')" == chris_staging ]]
echo "PASS: encrypted CHRiS backup restored and the record matched"
