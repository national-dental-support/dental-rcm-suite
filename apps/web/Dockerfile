# Dental RCM Suite - web application.
#
# Builds the Angular bundle, then serves it from nginx with API requests proxied
# to the api service, so the browser talks to a single origin and no CORS
# preflight is involved.

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
RUN npx ng build --configuration=production

FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist/web /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
