# Build stage: installs exactly what the lockfile says and builds the static site.
FROM node:24-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Run stage: nginx serves the files and forwards /api to the backend.
FROM nginx:1.29-alpine
# BACKEND is where /api goes. In docker compose that is the app container.
ENV BACKEND=http://app:8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY nginx-security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /build/dist /usr/share/nginx/html
EXPOSE 80
