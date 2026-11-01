FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
# Bootstrap creates tables, roles, the first admin, store and till (safe on every start), then runs the API.
CMD ["sh", "-c", "npm run bootstrap && npm start"]
