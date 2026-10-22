#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/lib/postgresql/15/bin:$PATH"
export DATABASE_URL="postgresql://demo@127.0.0.1:5432/chris_client_demo"
export CHRIS_CLIENT_DEMO=true
: "${DEMO_PASSWORD:?A dedicated demo password is required}"
export JWT_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))")"
export JWT_EXPIRES_IN=2h
export CHRIS_ENABLE_SYNTHETIC_ZERMATT_FIXTURE=true
export CHRIS_STAGING_ZERMATT_HEAD_HR_PASSWORD="$DEMO_PASSWORD"
export CHRIS_STAGING_ZERMATT_ABJ_HR_PASSWORD="$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))")"
export CHRIS_STAGING_ZERMATT_PHC_HR_PASSWORD="$CHRIS_STAGING_ZERMATT_ABJ_HR_PASSWORD"
export CHRIS_STAGING_ZERMATT_LAG_HR_PASSWORD="$CHRIS_STAGING_ZERMATT_ABJ_HR_PASSWORD"
export CORS_ALLOWED_ORIGINS="${RENDER_EXTERNAL_URL:-http://localhost:10000}"
DEMO_PGDATA="$(mktemp -d /tmp/chris-demo.XXXXXX)"
initdb -D "$DEMO_PGDATA" -U demo --auth=trust --encoding=UTF8 >/dev/null
pg_ctl -D "$DEMO_PGDATA" -o "-h 127.0.0.1 -p 5432 -k /tmp -c shared_buffers=16MB -c max_connections=20" -l /tmp/demo-postgres.log -w start
createdb -h 127.0.0.1 -U demo chris_client_demo
cd backend
node scripts/demo-guard.cjs
npx prisma migrate deploy
node scripts/provision-client-demo.cjs
cd ..
exec node backend/scripts/client-demo-server.cjs
