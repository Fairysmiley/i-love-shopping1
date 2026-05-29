# ---------- Stage 1: build ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* env vars at build time.
ARG VITE_API_BASE_URL=http://localhost:3001/api/v1
ARG VITE_RECAPTCHA_SITE_KEY=
ARG VITE_GOOGLE_OAUTH_ENABLED=false
ARG VITE_FACEBOOK_OAUTH_ENABLED=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY \
    VITE_GOOGLE_OAUTH_ENABLED=$VITE_GOOGLE_OAUTH_ENABLED \
    VITE_FACEBOOK_OAUTH_ENABLED=$VITE_FACEBOOK_OAUTH_ENABLED

RUN npm run build

# ---------- Stage 2: serve ----------
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
