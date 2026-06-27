FROM node:20-slim

# OpenSSL (Prisma) + Chromium y fuentes (puppeteer-core para el contrato PDF)
RUN apt-get update -y && apt-get install -y \
    openssl chromium fonts-liberation fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node src/index.js"]
