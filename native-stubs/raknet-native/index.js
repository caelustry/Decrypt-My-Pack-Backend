// Functional stub replacing the real native raknet-native addon (see
// package.json in this folder for why). Rather than faking failure,
// this wraps the real jsp-raknet package (a normal, always-present
// bedrock-protocol dependency — pure JS, no native compilation needed)
// and re-exposes it through the same interface bedrock-protocol's
// RakNativeClient class expects from 'raknet-native'. That way it
// doesn't matter whether bedrock-protocol picks the 'raknet-native' or
// 'jsp-raknet' code path internally — both end up running working,
// pure-JS RakNet underneath.
//
// Interface reconstructed from bedrock-protocol's own src/rak.js
// (RakNativeClient and RakJsClient classes) — not guessed.

const { Client: JspClient, EncapsulatedPacket, Reliability } = require('jsp-raknet');

const PacketPriority = { IMMEDIATE_PRIORITY: 0, MEDIUM_PRIORITY: 1 };
const PacketReliability = { RELIABLE_ORDERED: Reliability?.ReliableOrdered ?? 0 };

class Client {
  constructor(host, port) {
    this._inner = new JspClient(host, port);
    this._listeners = {};

    this._inner.on('connected', () => this._emit('connect'));
    this._inner.on('disconnect', (reason) => this._emit('disconnect', { reason }));
    this._inner.on('encapsulated', (encapsulated, addr) => {
      const buffer = encapsulated?.buffer ?? encapsulated;
      this._emit('encapsulated', { buffer, address: addr?.hash ?? addr });
    });
  }

  on(event, cb) {
    (this._listeners[event] ??= []).push(cb);
    return this;
  }

  _emit(event, ...args) {
    for (const cb of this._listeners[event] || []) cb(...args);
  }

  connect() {
    Promise.resolve(this._inner.connect()).catch((err) => {
      this._emit('disconnect', { reason: err?.message || 'connect failed' });
    });
  }

  ping() {
    this._inner.ping?.((data) => this._emit('pong', { extra: data }));
  }

  close() {
    this._inner.close?.();
  }

  send(buffer, _priority, _reliability, _channel) {
    const packet = new EncapsulatedPacket();
    packet.reliability = Reliability.ReliableOrdered;
    packet.buffer = buffer;
    this._inner.connection?.addEncapsulatedToQueue(packet);
    this._inner.connection?.sendQueue();
  }
}

function unavailable() {
  throw new Error(
    'raknet-native Server is stubbed out on this deployment — this fetch ' +
      'tool only acts as a client, server support was intentionally not ' +
      'implemented in the stub.'
  );
}

class Server {
  constructor() {
    unavailable();
  }
}

module.exports = {
  Client,
  Server,
  PacketPriority,
  PacketReliability,
};
