# Front-end image: build the Vite bundle, then serve it as static files.
#
# Build from this directory (Railway does so automatically when the service's
# root directory is set to frontend/):
#
#   docker build --build-arg VITE_API_URL=https://your-api.up.railway.app \
#                -t plately-web frontend/
#
# VITE_API_URL has to be present at BUILD time, not run time. Vite substitutes
# import.meta.env.* into the bundle when it compiles; there is no environment
# left to read once the app is a static file in a browser. Setting it as a
# runtime variable looks like it should work and silently leaves the app
# talking to http://localhost:8000 — see src/lib/api.ts.

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Caddy rather than nginx: it reads $PORT from the environment without a
# templating step, which is what Railway needs.
FROM caddy:2-alpine

COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
