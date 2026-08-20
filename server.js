// server.js
// Standalone backend for Bedrock Pack Fetcher - a normal, always-on
// Node process (not a serverless function). This is what removes the
// class of problems we hit on Vercel: no execution-time ceiling, no
// bundler stripping native files, and outbound UDP behaves exactly
// like it would on any regular server.
//
// Endpoints:
//   GET /health                            -- Liveness check for Render
//   GET /fetch-pack?ip=<host>&port=<port>  -- SSE stream of the real
//                                             RakNet handshake + resource-pack negotiation for the target
//                                             server. This connects as a lightweight bot client (bedrock-protocol),
//                                             not a real player.

import express from "express";
import cors from "cors";
import bedrock from "bedrock-protocol";

const app = express();
const PORT = process.env.PORT || 3000;

// Safety net: jsp-raknet (the RakNet backend, see native stubs/raknet native)
// has known stability issues - an uncaught internal exception should not
// take down the entire server and every in-flight request with it. This
// logs and survives instead of crashing. Node's own docs caution that
// process.state can be "in an undefined state" after an uncaught
// exception in general - but this server holds no shared state between
// requests (each /fetch-pack call is self-contained), so continuing is
// safe here specifically.
process.on("uncaughtException", (err) => {
    console.error("[uncaughtException] survived:", err?.message, err?.stack);
});
process.on("unhandledRejection", (err) => {
    console.error("[unhandledRejection] survived:", err);
});

// Restrict this to your actual Vercel domain once you know it, e.g.:
// origin: "https://vercel.app"
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
    "disconnect"
];

app.get("/fetch-pack", async (req, res) => {
    const { ip, port } = req.query;

    if (!ip) {
        res.status(400).json({ error: "Missing required query param: ip" });
        return;
    }

    const targetPort = Number(port) || 19132;

    res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
    });

    const send = (level, text, extra) => {
        // Fix for the 'write after end' crash: check if connection is still alive
        if (res.writableEnded || !res.writable) return;
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
            // already closed - ignore
        }
    };

    // No serverless execution ceiling here, but we still want a sane
    // upper bound so a hung connection doesn't leak forever.
    const hardTimeout = setTimeout(() => finish("Timed out after 90s"), 90000);

    req.on("close", () => {
        clearTimeout(hardTimeout);
        finish("client disconnected");
    });

    try {
        send("INFO", `Pinging host ${ip}:${targetPort} to detect Minecraft version...`);

        // 1. Automatically detect the target server's version via connection ping
        let detectedVersion;
        try {
            const pingResult = await bedrock.ping({ host: ip, port: targetPort });
            detectedVersion = pingResult.version;
            send("INFO", `Detected Server Version: ${detectedVersion}`);
        } catch (pingErr) {
            // Fallback version if pinging is blocked or fails, to keep the process moving
            detectedVersion = "1.21.50";
            send("WARN", `Ping failed (${pingErr.message}). Defaulting to handshake version: ${detectedVersion}`);
        }

        send("INFO", `Opening RakNet session (bedrock-protocol, jsp-raknet backend)...`);

        // 2. Pass the detected version dynamically into the client options
        client = bedrock.createClient({
            host: ip,
            port: targetPort,
            username: "PackFetcher",
            offline: true,
            version: detectedVersion,
            raknetBackend: "jsp-raknet",
        });

        client.on("connect_allowed", () => {
            send("PACKET", "RakNet connection accepted");
        });

        client.on("session", () => {
            send("INFO", "RakNet session established, entering login sequence...");

            for (const packetName of WATCHED_PACKETS) {
                client.on(packetName, (packet) => {
                    send("PACKET", `RX: ${packetName}`, packet);

                    if (packetName === "resource_packs_info") {
                        send("WARN", "Reached resource_pack_stack - negotiation observed (milestone 1 complete)");
                        finish("milestone 1 complete");
                    }
                    if (packetName === "disconnect") {
                        send("WARN", `Server sent disconnect: ${packet?.message ?? "no message provided"}`);
                        finish("server disconnected us");
                    }
                });
            }
        });

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
