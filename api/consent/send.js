/**
 * api/consent/send.js — Send COPPA parental consent email via Resend.
 *
 * POST /api/consent/send
 * Body: { parentEmail, athleteNickname }
 *
 * Generates a self-validating HMAC-signed token (no database needed).
 * Sends email via Resend REST API.
 * Logs hashed consent record to /logs/coppa-consent.jsonl.
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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: "RESEND_API_KEY not configured" });

  const { parentEmail, athleteNickname } = req.body || {};

  if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    return res.status(400).json({ error: "Valid parentEmail required" });
  }

  const token = generateToken(parentEmail);
  const baseUrl = getBaseUrl(req);
  const confirmUrl = `${baseUrl}/api/consent/confirm?token=${encodeURIComponent(token)}`;
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
      return res.status(502).json({ error: "Failed to send consent email" });
    }

    const sendData = await sendRes.json();
    console.log("[consent] Email sent:", sendData.id);

    return res.status(200).json({ ok: true, emailId: sendData.id });
  } catch (e) {
    console.error("[consent] Send error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
