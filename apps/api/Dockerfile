# Dental RCM Suite - API server.
#
# Two stages so the runtime image carries compiled JavaScript and production
# dependencies only, not the TypeScript toolchain.

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# mssql is a build-time dependency, so --omit=dev above leaves it out. The
# migration runner needs it at runtime: docker-compose mounts db/ at /app/db
# and runs it from this image. db/ itself is outside this build context, so the
# image cannot migrate without that mount.
COPY --from=build /app/node_modules/mssql ./node_modules/mssql

# Run unprivileged. The node image provides this user.
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health-monitor').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/index.js"]
