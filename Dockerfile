FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY engine/ ./engine/
EXPOSE 8000
CMD ["node", "engine/api.js"]
