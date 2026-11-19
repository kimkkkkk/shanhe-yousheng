FROM node:22-alpine AS build

WORKDIR /app
COPY package.json ./
COPY index.html manifest.webmanifest sw.js ./
COPY src ./src
COPY assets ./assets
COPY icons ./icons
COPY config ./config
COPY scripts ./scripts
RUN node scripts/build.mjs

FROM caddy:2.8-alpine

COPY --from=build /app/dist /srv/
COPY deploy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443

# Caddy 默认命令会读取上面的 Caddyfile，并为 SITE_ADDRESS 自动申请 HTTPS 证书。
