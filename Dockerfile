FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY knexfile.js ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx knex migrate:latest && exec node src/server.js"]
