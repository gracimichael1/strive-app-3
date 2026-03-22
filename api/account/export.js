/**
 * api/account/export.js — CCPA data export endpoint.
 *
 * GET /api/account/export — Returns all user data as JSON.
 *
 * Pre-Supabase: Returns what we know from the request context.
 * Phase 3-A will query all Supabase tables for the authenticated user.
 */

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Strive-Token");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST with user data in body" });
  }

  const token = req.headers["x-strive-token"];
  if (token !== (process.env.STRIVE_APP_TOKEN || "strive-2026-launch")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Pre-Supabase: Client sends its own data for export
  // Phase 3-A: Server queries all tables for authenticated user
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
