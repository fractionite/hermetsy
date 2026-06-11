FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/database/package.json ./packages/database/
COPY packages/database/prisma ./packages/database/prisma/
COPY packages/shared/package.json ./packages/shared/

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--workspace", "@etsybot/web"]
