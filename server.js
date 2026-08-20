// server.js
//
// Standalone backend for Bedrock Pack Fetcher — a normal, always-on
// Node process (not a serverless function). This is what removes the
// class of problems we hit on Vercel: no execution-time ceiling, no
// bundler stripping native files, and outbound UDP behaves exactly
// like it would on any regular server.
//
// Endpoints:
//   GET /health                       — liveness check for Render
//   GET /fetch-pack?ip=<host>&port=<port>   — SSE stream of the real
//     RakNet handshake + resource-pack negotiation for the target
//     server. This connects as a lightweight bot client (bedrock-protocol),
//     not a real player.

import express from "express";
import cors from "cors";
import bedrock from "bedrock-protocol";

const app = express();
const PORT = process.env.PORT || 3000;

// Restrict this to your actual Vercel domain once you know it, e.g.:
//   origin: "https://decrypt-my-pack.vercel.app"
// Left open for now so you can get the connection working first.
app.use(cors({ origin: "*" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

const WATCHED_PACKETS = [
  "network_settings",
  "resource_packs_info",
  "resource_pack_stack",
  "resource_pack_data_info",
  "resource_pack_chunk_data",
  "resource_pack_client_response",
  "play_status",
  "disconnect",
];

app.get("/fetch-pack", (req, res) => {
  const { ip, port } = req.query;

  if (!ip) {
    res.status(400).json({ error: "Missing required query param: ip" });
    return;
  }
  const targetPort = Number(port) || 19132;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const send = (level, text, extra) => {
    res.write(`data: ${JSON.stringify({ level, text, extra, t: Date.now() })}\n\n`);
  };

  let client;
  let finished = false;

  const finish = (reason) => {
    if (finished) return;
    finished = true;
    send("INFO", `Closing connection (${reason})`);
    res.end();
    try {
      client?.close();
    } catch {
      // already closed — ignore
    }
  };

  // No serverless execution ceiling here, but we still want a sane
  // upper bound so a hung connection doesn't leak forever.
  const hardTimeout = setTimeout(() => finish("timed out after 90s"), 90_000);

  req.on("close", () => {
    clearTimeout(hardTimeout);
    finish("client disconnected");
  });

  try {
    send("INFO", `Resolving host ${ip}:${targetPort}...`);
    send("INFO", "Opening RakNet session (bedrock-protocol, jsp-raknet backend)...");

    client = bedrock.createClient({
      host: ip,
      port: targetPort,
      username: "PackFetcher",
      offline: true,
      // No "version" key at all — omitting it (not setting it to false)
      // is what triggers bedrock-protocol's auto-detection via ping.
      // Explicitly passing `false` throws "Unsupported version false".
      raknetBackend: "jsp-raknet",
    });

    client.on("connect_allowed", () => {
      send("PACKET", "RakNet connection accepted");
    });

    client.on("session", () => {
      send("INFO", "RakNet session established, entering login sequence...");
    });

    for (const packetName of WATCHED_PACKETS) {
      client.on(packetName, (packet) => {
        send("PACKET", `RX  ${packetName}`, packet);

        if (packetName === "resource_pack_stack") {
          send("DONE", "Reached resource_pack_stack — negotiation observed successfully.");
          finish("milestone 1 complete");
        }
        if (packetName === "disconnect") {
          send("WARN", `Server sent disconnect: ${packet?.message ?? "no reason given"}`);
          finish("server disconnected us");
        }
      });
    }

    client.on("error", (err) => {
      send("ERROR", `Connection error: ${err.message}`);
      finish("error");
    });

    client.on("close", () => {
      send("INFO", "Underlying connection closed.");
      finish("connection closed");
    });
  } catch (err) {
    send("ERROR", `Failed to start client: ${err.message}`);
    finish("startup exception");
  }
});

app.listen(PORT, () => {
  console.log(`Bedrock Pack Fetcher backend listening on port ${PORT}`);
});
