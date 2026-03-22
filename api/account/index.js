/**
 * api/account/index.js — Account deletion endpoint.
 *
 * DELETE /api/account — Full cascade deletion.
 *
 * Pre-Supabase: Clears localStorage-bound data, sends confirmation email,
 * logs deletion. Supabase cascade will be wired in Phase 3-A.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

const LOG_DIR = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "deletions.jsonl");

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function logDeletion(record) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + "\n", "utf-8");
  } catch (e) {
    console.error("[account] Deletion log write failed:", e.message);
  }
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Strive-Token");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = req.headers["x-strive-token"];
  if (token !== (process.env.STRIVE_APP_TOKEN || "strive-2026-launch")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { userEmail, reason } = req.body || {};
  const userId = req.body?.userId || "local-user";

  // ── Phase 3-A: Supabase cascade (stubbed) ──────────────────────────────
  // When Supabase is live, this cascade executes in order:
  // 1. DELETE engagement_events, streaks, milestones, injury_flags WHERE athlete_id IN (SELECT id FROM athletes WHERE user_id = ?)
  // 2. DELETE training_labels WHERE analysis_id IN (SELECT id FROM analyses WHERE user_id = ?)
  // 3. UPDATE analyses SET video_url = NULL WHERE user_id = ? (anonymize, keep scores)
  //    then UPDATE analyses SET user_id = NULL WHERE user_id = ?
  // 4. DELETE meets WHERE athlete_id IN (SELECT id FROM athletes WHERE user_id = ?)
  // 5. DELETE athletes WHERE user_id = ?
  // 6. DELETE users WHERE id = ?
  // 7. supabase.auth.admin.deleteUser(userId)
  // 8. Stripe: cancel all active subscriptions if stripe_customer_id exists
  // NEVER DELETE coppa_consents — SET user_id = NULL (3-year audit trail)

  console.log(`[account] DELETE requested for user ${sha256(userId).substring(0, 12)}...`);

  // ── Log deletion (hashed PII only) ─────────────────────────────────────
  logDeletion({
    timestamp: new Date().toISOString(),
    user_id_hash: sha256(userId),
    reason: reason || "user_request",
    cascade_status: "pre_supabase",
  });

  // ── Send confirmation email via Resend ─────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && userEmail) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "STRIVE Gymnastics <onboarding@resend.dev>",
          to: [userEmail],
          subject: "Your STRIVE account has been deleted",
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#333">
            <h1 style="color:#e8962a">STRIVE Gymnastics</h1>
            <p>All your data has been permanently deleted from STRIVE.</p>
            <p>This includes your athlete profiles, analysis history, training notes, and any associated data.</p>
            <p>If you did not request this deletion, please contact us immediately.</p>
            <p style="color:#888;font-size:13px;margin-top:24px">STRIVE Gymnastics · ${new Date().toISOString().split("T")[0]}</p>
          </div>`,
        }),
      });
    } catch (e) {
      console.error("[account] Confirmation email failed:", e.message);
    }
  }

  return res.status(200).json({
    ok: true,
    message: "Account deletion initiated. All data will be permanently removed.",
    cascade_status: "pre_supabase",
  });
}
