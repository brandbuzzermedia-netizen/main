# GBS Report Studio: Next.js server with Chromium for PDF export.
#   docker build -t gbs-report-studio .
#   docker run -p 3000:3000 -v gbs-data:/app/data \
#     -e STUDIO_PASSWORD=... -e SESSION_SECRET=... gbs-report-studio
#
# Based on Microsoft's Playwright image, which ships Chromium and its system
# libraries. Keep its version equal to "playwright" in package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 \
    PDF_RENDER_ORIGIN=http://127.0.0.1:3000
COPY --from=build /app/package.json /app/package-lock.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
# Clients, reports and uploaded screenshots live here: mount a persistent volume.
# Runs as root so it can write to host-mounted disks, which are root-owned.
RUN mkdir -p /app/data
VOLUME /app/data
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
