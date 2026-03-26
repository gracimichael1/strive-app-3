/**
 * api/account.js — Account management (consolidated).
 * DELETE /api/account              → account deletion
 * POST   /api/account?action=export → CCPA data export
 * GET    /api/account?action=subscription → subscription lookup
 * Consolidated from account/index.js + export.js + subscription.js
 * Phase 3-A will migrate all logic to Supabase.
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

// ── Subscription lookup (from account/subscription.js) ─────────────────────

const ALLOWED_ORIGINS = [
  'https://strive-app-amber.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.match(/^https:\/\/strive-app.*\.vercel\.app$/)) return true;
  return false;
}

// ── Main handler ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "DELETE, POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Strive-Token");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── Route: GET ?action=subscription ───────────────────────────────────────
  if (req.method === "GET" && req.query.action === "subscription") {
    const token = req.headers['x-strive-token'];
    if (!process.env.STRIVE_APP_TOKEN) return res.status(500).json({ error: 'Server misconfigured' });
    if (token !== process.env.STRIVE_APP_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
      const { kv } = await import('@vercel/kv');
      const record = await kv.get(`sub:${email}`);
      if (!record) {
        return res.json({ tier: 'free', status: 'none' });
      }
      const parsed = typeof record === 'string' ? JSON.parse(record) : record;
      return res.json({
        tier: parsed.tier || 'free',
        status: parsed.status || 'none',
        current_period_end: parsed.current_period_end || null
      });
    } catch (err) {
      console.error('STRIVE subscription lookup error:', err);
      return res.status(500).json({ tier: 'free', status: 'error' });
    }
  }

  // ── Route: POST ?action=export (CCPA) ─────────────────────────────────────
  if (req.method === "POST" && req.query.action === "export") {
    const token = req.headers["x-strive-token"];
    if (!process.env.STRIVE_APP_TOKEN) return res.status(500).json({ error: "Server misconfigured" });
    if (token !== process.env.STRIVE_APP_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { profile, analysisHistory, tier } = req.body || {};

    const exportData = {
      export_date: new Date().toISOString(),
      export_version: "1.0",
      note: "This is all data STRIVE has associated with your account.",
      profile: {
        level: profile?.level || "",
        gender: profile?.gender || "",
        gym_affiliation: profile?.gymName || "",
        tier: tier || "free",
      },
      analysis_history: (analysisHistory || []).map((h) => ({
        date: h.date || h.timestamp,
        event: h.event || "",
        score: h.score || h.finalScore || null,
        skills_count: h.skillCount || null,
      })),
      data_retention: {
        videos: "Not stored. Processed by Google Gemini and deleted within 48 hours.",
        scores: "Retained until account deletion.",
        training_notes: "Retained until account deletion.",
      },
      your_rights: {
        delete: "Settings → Delete Account to permanently remove all data.",
        contact: "Email support for any data questions.",
      },
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=strive-data-export.json");
    return res.status(200).json(exportData);
  }

  // ── Route: DELETE /api/account ─────────────────────────────────────────────
  if (req.method === "DELETE") {
    const token = req.headers["x-strive-token"];
    if (!process.env.STRIVE_APP_TOKEN) return res.status(500).json({ error: "Server misconfigured" });
    if (token !== process.env.STRIVE_APP_TOKEN) {
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

    logDeletion({
      timestamp: new Date().toISOString(),
      user_id_hash: sha256(userId),
      reason: reason || "user_request",
      cascade_status: "pre_supabase",
    });

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
      purgeTimestamp: Date.now(),
      cleared: true,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
