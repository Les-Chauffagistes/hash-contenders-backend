# syntax=docker/dockerfile:1

FROM node:20-alpine

WORKDIR /app

# 1) deps
COPY package*.json ./
RUN npm ci --omit=dev

# 2) app sources
COPY . .

# 3) run as non-root
RUN addgroup -S app && adduser -S app -G app \
  && chown -R app:app /app
USER app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3005

EXPOSE 3005

CMD ["node", "src/index.js"]
