# ---------- Stage 1: build ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (cached unless package files change)
COPY package*.json ./
RUN npm ci

# Generate Prisma client + compile TypeScript
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build
# Compile the seed script to plain JS so the lean runtime image needs no ts-node
RUN npx tsc prisma/seed.ts --outDir dist-seed --module commonjs --target ES2021 \
    --esModuleInterop --skipLibCheck --resolveJsonModule

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Only production dependencies in the final image
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Prisma needs the schema + generated client + migrations at runtime
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-seed ./dist-seed

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
