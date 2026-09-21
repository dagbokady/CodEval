# Construit le frontend puis le sert avec Caddy (HTTPS automatique).
FROM node:22-alpine AS build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# API servie sur le même domaine, sous /api : chemin relatif
ENV VITE_API_URL=""
RUN npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
