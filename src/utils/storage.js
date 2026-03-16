// ─── STORAGE WRAPPER — works in Claude artifacts AND real browsers ──
const storage = {
  async get(key) {
    if (typeof window !== 'undefined' && window.storage?.get) {
      try { const r = await window.storage.get(key); if (r) return r; } catch {}
    }
    try { const v = localStorage.getItem(key); if (v !== null) return { key, value: v }; } catch {}
    return null;
  },
  async set(key, value) {
    if (typeof window !== 'undefined' && window.storage?.set) {
      try { await window.storage.set(key, value); } catch {}
    }
    try { localStorage.setItem(key, value); } catch {}
  },
  async delete(key) {
    if (typeof window !== 'undefined' && window.storage?.delete) {
      try { await window.storage.delete(key); } catch {}
    }
    try { localStorage.removeItem(key); } catch {}
  },
};

export default storage;
