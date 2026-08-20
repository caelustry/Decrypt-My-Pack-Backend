# Bedrock Pack Fetcher — Backend

Standalone, always-on Node/Express server that does the real RakNet
handshake and resource-pack negotiation (via `bedrock-protocol`, forced
onto its pure-JS `jsp-raknet` backend — no native compilation needed).

This exists separately from the frontend because serverless platforms
(Vercel) can't reliably host a library with native-module dependencies
and long-lived connections. A normal host removes both problems.

## Deploying to Render (free tier)

1. Put this folder in its own GitHub repo (or as a subfolder of an
   existing repo — Render lets you set a "Root Directory").
2. Go to [render.com](https://render.com), sign up (no credit card
   required for the free tier), click **New → Web Service**.
3. Connect your GitHub repo. If this is a subfolder, set **Root
   Directory** to that folder's path.
4. Render should detect the `Dockerfile` automatically and offer
   **Docker** as the environment — select it if it doesn't auto-detect.
5. Choose the **Free** instance type.
6. Click **Create Web Service**. First deploy takes a few minutes
   (Docker build + npm install).
7. Once live, you'll get a URL like `https://your-service.onrender.com`.

## Testing it

```bash
curl "https://your-service.onrender.com/health"
curl -N "https://your-service.onrender.com/fetch-pack?ip=zeqa.net&port=19132"
```

## Notes

- **Free tier spins down after 15 minutes of inactivity** and cold-starts
  (takes ~30–60s) on the next request. Fine for occasional personal use;
  not for something you need instantly available at all times.
- `cors({ origin: "*" })` in `server.js` is wide open for now. Once your
  Vercel frontend URL is stable, tighten this to that exact origin.
- This is milestone 1 — it logs every resource-pack-related packet
  verbatim so we can see real field names before writing chunk-download
  and zip-assembly logic on top.
