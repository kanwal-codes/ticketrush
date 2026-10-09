# Build stage: installs exactly what the lockfile says and builds the static site.
FROM node:26-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The public site key for the sign-up bot check (empty means none). Fly passes it as a build argument.
ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
ARG VITE_STRIPE_PUBLISHABLE_KEY=""
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY
ARG VITE_SUPPORT_EMAIL=""
ENV VITE_SUPPORT_EMAIL=$VITE_SUPPORT_EMAIL
# Types and tests are checked by CI before an image is built, so this only bundles (the checks need e2e/ and scripts/,
# which the image's context leaves out).
RUN npx vite build

# Run stage: nginx serves the files and forwards /api to the backend.
FROM nginx:1.31-alpine
# BACKEND is where /api goes, RESOLVER the DNS server that finds it. The defaults are docker compose's; Fly sets both.
ENV BACKEND=http://app:8080
ENV RESOLVER=127.0.0.11
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY nginx-security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /build/dist /usr/share/nginx/html
EXPOSE 80
