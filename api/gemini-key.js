/**
 * DEPRECATED — API key is no longer exposed to the browser.
 * All Gemini calls now route through /api/gemini server proxy.
 */
export default function handler(req, res) {
  res.status(410).json({
    error: "This endpoint has been retired. Use /api/gemini proxy instead.",
    available: false,
  });
}
