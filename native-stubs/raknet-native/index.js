// Stub replacing the real native raknet-native addon (see package.json in
// this folder for why). Exports objects shaped closely enough that a
// require() or destructure doesn't throw — if bedrock-protocol ever
// actually tries to *use* one of these because raknetBackend somehow
// wasn't honored, it fails loudly and clearly here instead of the
// cryptic native "Could not locate the bindings file" error.

function unavailable() {
  throw new Error(
    "raknet-native is stubbed out on this deployment (no native build " +
      "support on Vercel). This code path should be unreachable — " +
      "raknetBackend is set to 'jsp-raknet' in api/fetch-pack.js. If you " +
      "see this error, something is forcing the native backend."
  );
}

class Stub {
  constructor() {
    unavailable();
  }
}

module.exports = {
  Client: Stub,
  Server: Stub,
  Listener: Stub,
  Connection: Stub,
};
