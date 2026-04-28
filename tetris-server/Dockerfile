FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy source
COPY server.js ./

# Scores database will live in a mounted volume at /app/data
ENV DB_PATH=/app/data/scores.db

EXPOSE 3000

CMD ["node", "server.js"]
