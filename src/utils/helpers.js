// ─── STRUCTURED LOGGING ─────────────────────────────────────────────
export const log = {
  _fmt(level, stage, msg, data) {
    const ts = new Date().toISOString().slice(11, 23);
    const prefix = `[${ts}] [${level}] [${stage}]`;
    if (data !== undefined) console.log(prefix, msg, data);
    else console.log(prefix, msg);
  },
  info(stage, msg, data) { log._fmt("INFO", stage, msg, data); },
  warn(stage, msg, data) { log._fmt("WARN", stage, msg, data); },
  error(stage, msg, data) { log._fmt("ERROR", stage, msg, data); },
};

// ─── HTML ESCAPING (prevent XSS from AI-generated content) ──────────────────
export function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── SAFETY UTILITIES (prevent crashes from unexpected AI response shapes) ──
export function safeStr(val, fallback = "") {
  if (val == null) return fallback;
  if (typeof val === "string") return escapeHtml(val);
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return val.map(v => safeStr(v)).join("; ");
  if (typeof val === "object") {
    const raw = val.text || val.description || val.tip || val.advice || val.name || val.reason || val.skill || val.correction || val.currentFault || JSON.stringify(val);
    return escapeHtml(typeof raw === "string" ? raw : String(raw));
  }
  return String(val);
}

export function safeArray(val) {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  if (typeof val === "object") return Object.values(val);
  return [val];
}

export function safeNum(val, fallback = 0, min = -Infinity, max = Infinity) {
  const n = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ─── localStorage QUOTA MONITORING ──────────────────────────────────────────

const QUOTA_WARNING_BYTES = 4 * 1024 * 1024; // 4MB — warn before hitting 5MB browser limit
const QUOTA_PRUNE_THRESHOLD = 0.80; // Prune old data when usage > 80%

/**
 * Estimate current localStorage usage in bytes.
 * Returns { usedBytes, totalKeys, warning }
 */
export function checkStorageQuota() {
  try {
    let totalBytes = 0;
    const totalKeys = localStorage.length;
    for (let i = 0; i < totalKeys; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key);
      if (key && val) {
        totalBytes += (key.length + val.length) * 2; // UTF-16 = 2 bytes per char
      }
    }
    return {
      usedBytes: totalBytes,
      usedMB: Math.round(totalBytes / 1024 / 1024 * 100) / 100,
      totalKeys,
      warning: totalBytes > QUOTA_WARNING_BYTES
        ? `Storage at ${Math.round(totalBytes / 1024 / 1024 * 100) / 100}MB — approaching 5MB limit`
        : null,
    };
  } catch {
    return { usedBytes: 0, usedMB: 0, totalKeys: 0, warning: null };
  }
}

/**
 * Prune old analyses from localStorage if quota exceeds threshold.
 * Removes analyses older than maxAgeDays (default 180 = 6 months).
 */
export function pruneOldAnalyses(maxAgeDays = 180) {
  try {
    const quota = checkStorageQuota();
    if (quota.usedBytes < QUOTA_WARNING_BYTES * QUOTA_PRUNE_THRESHOLD) return 0;

    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let pruned = 0;

    // Prune from strive_recent_analyses
    const recentKey = 'strive_recent_analyses';
    const raw = localStorage.getItem(recentKey);
    if (raw) {
      try {
        const analyses = JSON.parse(raw);
        if (Array.isArray(analyses)) {
          const kept = analyses.filter(a => {
            const ts = a?.timestamp || a?.date || a?._meta?.timestamp;
            return ts && ts > cutoff;
          });
          if (kept.length < analyses.length) {
            pruned += analyses.length - kept.length;
            localStorage.setItem(recentKey, JSON.stringify(kept));
          }
        }
      } catch { /* corrupt data — leave it */ }
    }

    if (pruned > 0) {
      log.info("storage", `Pruned ${pruned} old analyses (older than ${maxAgeDays} days)`);
    }
    return pruned;
  } catch {
    return 0;
  }
}
