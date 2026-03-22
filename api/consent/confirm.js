/**
 * api/consent/confirm.js — Confirm COPPA parental consent.
 *
 * GET /api/consent/confirm?token=xxx
 *
 * Validates HMAC-signed token, logs confirmation, redirects to app.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

const LOG_DIR = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "coppa-consent.jsonl");

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function getSecret() {
  return process.env.STRIVE_CONSENT_SECRET || sha256(process.env.RESEND_API_KEY || "strive-fallback-secret");
}

function validateToken(token) {
  if (!token || !token.includes(".")) return { valid: false, reason: "Invalid token format" };

  const [payloadB64, sig] = token.split(".");
  const secret = getSecret();
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  if (sig !== expectedSig) return { valid: false, reason: "Invalid token signature" };

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));

    if (!payload.exp || Date.now() > payload.exp) {
      return { valid: false, reason: "Token expired" };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "Invalid token payload" };
  }
}

function logConsent(record) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + "\n", "utf-8");
  } catch (e) {
    console.error("[consent] Log write failed:", e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { token } = req.query;

  if (!token) {
    return res.status(400).send(errorPage("Missing consent token."));
  }

  const result = validateToken(token);

  if (!result.valid) {
    console.warn(`[consent] Token validation failed: ${result.reason}`);
    return res.status(400).send(errorPage(
      result.reason === "Token expired"
        ? "This consent link has expired. Please request a new one from the STRIVE app."
        : "This consent link is invalid. Please request a new one from the STRIVE app."
    ));
  }

  // Log confirmed consent (hashed PII only)
  logConsent({
    timestamp: new Date().toISOString(),
    parent_email_hash: result.payload.email_hash,
    token_hash: sha256(token),
    consent_version: result.payload.v || "1.0",
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
    ip_hash: sha256(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown"),
  });

  console.log("[consent] Consent confirmed for email_hash:", result.payload.email_hash.substring(0, 12) + "...");

  // Redirect to app with consent=confirmed
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;

  res.writeHead(302, { Location: `${baseUrl}/?consent=confirmed` });
  res.end();
}

function errorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>STRIVE — Consent</title>
  <style>
    body { font-family: 'Arial', sans-serif; background: #070c16; color: #E2E8F0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
    .card { max-width: 440px; background: #0d1422; border-radius: 16px; border: 1px solid rgba(232,150,42,0.12); padding: 40px 24px; text-align: center; }
    h1 { color: #e8962a; font-size: 20px; margin: 0 0 16px 0; }
    p { color: #8890AB; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>STRIVE Gymnastics</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
