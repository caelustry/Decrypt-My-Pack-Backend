FROM node:22-slim

WORKDIR /app

# Copy dependency manifests first so Docker can cache the install layer
COPY package.json .npmrc ./
COPY native-stubs ./native-stubs

RUN npm install --omit=dev

COPY server.js ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
