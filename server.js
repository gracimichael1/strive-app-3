// ─── STRIVE API Server (Optional) ────────────────────────────────
// Not required for basic usage — the app talks directly to Gemini API.
// This server is for future features: Supabase proxy, webhooks, Stripe.
// Usage: node server.js

const http = require("http");
const PORT = process.env.PORT || 4001;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", app: "strive", version: "1.0.0" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[strive] API server running on http://localhost:${PORT}`);
});
