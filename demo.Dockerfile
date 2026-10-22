FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-15 openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --no-audit --no-fund
COPY . .
ENV VITE_API_BASE_URL=""
RUN npm run build && cd backend && DATABASE_URL=postgresql://demo@127.0.0.1:5432/chris_client_demo npx prisma generate
RUN chown -R node:node /app
USER node
ENV NODE_ENV=production CHRIS_CLIENT_DEMO=true
CMD ["bash", "demo-start.sh"]
