/**
 * api/consent.js — COPPA consent (consolidated).
 * POST /api/consent              → send parental consent email
 * GET  /api/consent?token=xxx   → confirm consent (email link target)
 * Consolidated from consent/send.js + consent/confirm.js
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

function generateToken(parentEmail) {
  const secret = getSecret();
  const payload = JSON.stringify({
    email_hash: sha256(parentEmail.toLowerCase().trim()),
    exp: Date.now() + 48 * 60 * 60 * 1000, // 48 hours
    v: "1.0",
    nonce: crypto.randomUUID(),
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
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

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "strive-app-amber.vercel.app";
  return `${proto}://${host}`;
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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── Route: GET /api/consent?token=xxx → confirm consent ───────────────────
  if (req.method === "GET") {
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
    return res.end();
  }

  // ── Route: POST /api/consent → send parental consent email ────────────────
  if (req.method === "POST") {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn("[consent] RESEND_API_KEY not configured — skipping email send");
      logConsent({
        timestamp: new Date().toISOString(),
        parent_email_hash: sha256((req.body?.parentEmail || "").toLowerCase().trim()),
        consent_version: "1.0",
        status: "pending_no_email",
        reason: "RESEND_API_KEY not configured",
      });
      return res.status(200).json({ ok: true, emailSent: false, message: "Consent recorded. Email delivery is not yet configured." });
    }

    const { parentEmail, athleteNickname } = req.body || {};

    if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
      return res.status(400).json({ error: "Valid parentEmail required" });
    }

    const token = generateToken(parentEmail);
    const baseUrl = getBaseUrl(req);
    const confirmUrl = `${baseUrl}/api/consent?token=${encodeURIComponent(token)}`;
    const displayName = athleteNickname || "your child";

    // Log pending consent (hashed PII only)
    logConsent({
      timestamp: new Date().toISOString(),
      parent_email_hash: sha256(parentEmail.toLowerCase().trim()),
      token_hash: sha256(token),
      consent_version: "1.0",
      status: "pending",
      ip_hash: sha256(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown"),
    });

    // Send email via Resend REST API
    const emailBody = {
      from: "STRIVE Gymnastics <onboarding@resend.dev>",
      to: [parentEmail.trim()],
      subject: "Action required: Approve your child's STRIVE account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333;">
          <h1 style="color: #e8962a; font-size: 24px;">STRIVE Gymnastics</h1>
          <h2 style="font-size: 18px; color: #222;">Parental Consent Required</h2>

          <p>Someone has created a STRIVE account for ${displayName} and listed you as the parent or guardian. STRIVE is an AI-powered gymnastics scoring and training app.</p>

          <p>Under the Children's Online Privacy Protection Act (COPPA), we need your consent before collecting any data from athletes under 13.</p>

          <h3 style="color: #e8962a; font-size: 16px;">What data we collect</h3>
          <ul>
            <li>Your child's gymnastics level and competitive division</li>
            <li>Performance scores and analysis history</li>
            <li>Training notes added by you or your child</li>
          </ul>

          <h3 style="color: #e8962a; font-size: 16px;">Third-party services</h3>
          <ul>
            <li><strong>Videos → Google Gemini</strong> (Google's AI service) for scoring analysis. Videos are deleted within 48 hours. STRIVE does not store uploaded videos.</li>
            <li><strong>Scores → Supabase</strong> (SOC 2 Type 2 certified) for secure data storage.</li>
            <li><strong>Payments → Stripe</strong> (PCI DSS Level 1) for subscription billing.</li>
          </ul>

          <h3 style="color: #e8962a; font-size: 16px;">Your rights as a parent</h3>
          <ul>
            <li><strong>Review</strong> all data collected about your child at any time</li>
            <li><strong>Delete</strong> all of your child's data permanently</li>
            <li><strong>Revoke</strong> this consent at any time, which will deactivate the account</li>
          </ul>
          <p>To exercise any of these rights, reply to this email or visit the Account page in the STRIVE app (Settings → Account).</p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${confirmUrl}" style="display: inline-block; background: #e8962a; color: #fff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: 700;">
              I Approve — Activate Account
            </a>
          </div>

          <p style="color: #888; font-size: 13px;">This link expires in 48 hours. If you did not request this, you can safely ignore this email.</p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #aaa; font-size: 12px;">STRIVE Gymnastics · Consent version 1.0 · ${new Date().toISOString().split("T")[0]}</p>
        </div>
      `,
    };

    let emailSent = false;
    let emailId = null;

    try {
      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailBody),
      });

      if (!sendRes.ok) {
        const err = await sendRes.text().catch(() => "");
        console.error("[consent] Resend error:", sendRes.status, err);
      } else {
        const sendData = await sendRes.json();
        console.log("[consent] Email sent:", sendData.id);
        emailSent = true;
        emailId = sendData.id;
      }
    } catch (e) {
      console.error("[consent] Email send failed:", e.message);
    }

    return res.status(200).json({
      ok: true,
      emailSent,
      emailId,
      message: emailSent
        ? "Consent email sent. Check your inbox."
        : "Consent recorded. Email delivery may be delayed.",
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
