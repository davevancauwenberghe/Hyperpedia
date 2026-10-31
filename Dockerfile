FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8080 HOST=0.0.0.0
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY scripts/create-admin.js scripts/check-data.js ./scripts/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "src/server.js"]
