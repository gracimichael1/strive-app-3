/**
 * frameExtractor.js
 * Pulls image frames out of an HTMLVideoElement at a target fps.
 * Uses willReadFrequently=true to silence the console warning.
 */

/**
 * @param {HTMLVideoElement} video
 * @param {number} fps  – frames per second to sample (default 8)
 * @param {function} onProgress  – called with (framesExtracted, totalFrames)
 * @returns {Promise<Array<{timestamp: number, canvas: HTMLCanvasElement}>>}
 */
export async function extractFrames(video, fps = 8, onProgress = null) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Wait for metadata
  await new Promise((resolve) => {
    if (video.readyState >= 1) return resolve();
    video.addEventListener('loadedmetadata', resolve, { once: true });
  });

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;

  const duration    = video.duration;
  const interval    = 1 / fps;
  const timestamps  = [];

  for (let t = 0; t < duration; t += interval) {
    timestamps.push(Math.min(t, duration - 0.001));
  }

  const frames = [];

  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];

    // Seek
    video.currentTime = t;
    await new Promise((resolve) => {
      video.onseeked = resolve;
    });

    // Capture frame onto its own canvas so we can reference it later
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width  = canvas.width;
    frameCanvas.height = canvas.height;
    const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
    frameCtx.drawImage(video, 0, 0, canvas.width, canvas.height);

    frames.push({ timestamp: t, canvas: frameCanvas });

    if (onProgress) onProgress(i + 1, timestamps.length);
  }

  return frames;
}

/**
 * Release canvas memory held by extracted frames.
 * Call after frame data is no longer needed (e.g., after landmark extraction).
 * @param {Array<{canvas: HTMLCanvasElement}>} frames
 */
export function cleanupFrames(frames) {
  if (!Array.isArray(frames)) return;
  for (const f of frames) {
    if (f.canvas) {
      f.canvas.width = 0;
      f.canvas.height = 0;
    }
  }
}
