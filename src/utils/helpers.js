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
