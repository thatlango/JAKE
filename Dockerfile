FROM node:22-alpine AS client-build
WORKDIR /app
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client ./client
RUN cd client && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY database ./database
COPY --from=client-build /app/client/dist ./client/dist
EXPOSE 3000
CMD ["sh","-c","node server/migrate.js && node server/index.js"]
