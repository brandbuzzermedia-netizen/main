# GBS Report Studio: Next.js server with Chromium for PDF export.
#   docker build -t gbs-report-studio .
#   docker run -p 3000:3000 -v gbs-data:/app/data \
#     -e STUDIO_PASSWORD=... -e SESSION_SECRET=... gbs-report-studio
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright PDF_RENDER_ORIGIN=http://127.0.0.1:3000
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
# Chromium and the system libraries it needs, at the version Playwright expects.
RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./
# Clients, reports and uploaded screenshots live here: mount a persistent volume.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME /app/data
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
