FROM node:22-slim

WORKDIR /app

# Copy dependency manifests first so Docker can cache the install layer
COPY package.json .npmrc ./
COPY native-stubs ./native-stubs

RUN npm install --omit=dev

# npm's "overrides" field wasn't reliably replacing raknet-native in
# practice (kept resolving to the real, native-only package regardless).
# Sidestep npm's resolution entirely: force our stub into node_modules
# directly via plain filesystem copy. Deterministic regardless of what
# npm did or didn't install for this package.
RUN rm -rf node_modules/raknet-native && cp -r native-stubs/raknet-native node_modules/raknet-native

COPY server.js ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
