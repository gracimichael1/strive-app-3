/**
 * STRIVE Video Compressor
 * Compresses uploaded gymnastics videos before Gemini upload.
 *
 * Strategy: draw video frames onto a canvas at 360p,
 * capture the canvas stream, re-encode via MediaRecorder
 * at 800kbps. Output: compressed Blob, still a real video.
 *
 * Target: 10–25MB for a 90-second routine
 * vs original: 150–800MB
 */

const TARGET_SHORT_SIDE = 360;
const TARGET_BITRATE = 800_000;     // 800kbps video
const AUDIO_BITRATE = 64_000;       // 64kbps audio (mono, analysis only)
const OUTPUT_FPS = 30;
const COMPRESS_THRESHOLD_MB = 30;   // Only compress if > 30MB (22s compress vs raw upload tradeoff)

/**
 * Main compression function.
 * @param {File} videoFile - original video from input
 * @param {function} onProgress - callback(0–100) for progress bar
 * @returns {Promise<{blob: Blob, mimeType: string, originalMB: number, compressedMB: number, reductionPct: number, outputDimensions: {width: number, height: number}}>}
 */
export async function compressVideo(videoFile, onProgress = () => {}) {
  onProgress(5);

  // ── 1. Load video into element ────────────────────────
  const videoUrl = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  // Wait for metadata so we know duration + dimensions
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error('Could not load video metadata'));
    setTimeout(() => reject(new Error('Video metadata timeout')), 10000);
  });

  const originalDuration = video.duration;
  const originalWidth = video.videoWidth;
  const originalHeight = video.videoHeight;
  const originalMB = videoFile.size / (1024 * 1024);

  // ── 2. Calculate target dimensions ───────────────────
  // Target 360p on the short side, maintain aspect ratio
  // Never upscale — if already small, keep original size
  let outWidth, outHeight;
  const aspectRatio = originalWidth / originalHeight;

  if (originalWidth <= 640 && originalHeight <= 640) {
    // Already small enough — skip dimension reduction
    outWidth = originalWidth;
    outHeight = originalHeight;
  } else if (aspectRatio >= 1) {
    // Landscape (most meet videos)
    outHeight = TARGET_SHORT_SIDE;
    outWidth = Math.round(TARGET_SHORT_SIDE * aspectRatio);
  } else {
    // Portrait (phone held vertically)
    outWidth = TARGET_SHORT_SIDE;
    outHeight = Math.round(TARGET_SHORT_SIDE / aspectRatio);
  }

  // Ensure even numbers (required by some encoders)
  outWidth = outWidth % 2 === 0 ? outWidth : outWidth + 1;
  outHeight = outHeight % 2 === 0 ? outHeight : outHeight + 1;

  console.log(`[Compressor] ${originalWidth}x${originalHeight} → ${outWidth}x${outHeight}, ${originalDuration.toFixed(1)}s, ${originalMB.toFixed(1)}MB`);

  onProgress(10);

  // ── 3. Set up canvas ──────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d');

  // ── 4. Determine best supported format ───────────────
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let mimeType;
  if (isIOS) {
    // iOS Safari: webm NOT supported, use mp4 if available
    mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : null;

    if (!mimeType) {
      // MediaRecorder doesn't support mp4 on this iOS version — use fallback
      console.warn('[Compressor] iOS MediaRecorder not supported — using size-check fallback');
      URL.revokeObjectURL(videoUrl);
      return _iosSizeFallback(videoFile, onProgress);
    }
  } else {
    // Non-iOS: prefer webm/vp9 (best compression), fall back to vp8
    mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : null;

    if (!mimeType) {
      console.warn('[Compressor] No supported MediaRecorder format — sending original');
      URL.revokeObjectURL(videoUrl);
      onProgress(100);
      return {
        blob: videoFile,
        mimeType: videoFile.type || 'video/mp4',
        originalMB,
        compressedMB: originalMB,
        reductionPct: 0,
        outputDimensions: { width: originalWidth, height: originalHeight },
      };
    }
  }

  // ── 5. Set up MediaRecorder ───────────────────────────
  const stream = canvas.captureStream(OUTPUT_FPS);

  // Add audio track from video if available
  try {
    if (video.captureStream) {
      const videoStream = video.captureStream();
      const audioTracks = videoStream.getAudioTracks();
      audioTracks.forEach(track => stream.addTrack(track));
    }
  } catch {
    // Audio capture not available — video only, still fine for analysis
  }

  const chunks = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: TARGET_BITRATE,
    audioBitsPerSecond: AUDIO_BITRATE,
  });

  recorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // ── 6. Play video and draw frames to canvas ───────────
  const compressionPromise = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
      resolve(blob);
    };
    recorder.onerror = (e) => reject(new Error('MediaRecorder error: ' + (e.error?.message || 'unknown')));
  });

  recorder.start(100); // collect data every 100ms

  video.currentTime = 0;
  // Play at 1x speed — DO NOT speed up. Frame skipping destroys scoring accuracy.
  video.playbackRate = 1;
  try {
    await video.play();
  } catch (e) {
    throw new Error('Video playback failed — this can happen on iOS if the video format is unsupported. Try a different video.');
  }

  // Draw each frame at requestAnimationFrame rate
  let lastProgress = 10;
  let rafId = null;
  const drawFrame = () => {
    if (video.paused || video.ended) {
      if (recorder.state === 'recording') {
        // Small delay to ensure last frames are captured
        setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 200);
      }
      return;
    }

    // Draw current frame scaled to canvas
    ctx.drawImage(video, 0, 0, outWidth, outHeight);

    // Update progress based on video playback position
    const pct = Math.round(10 + (video.currentTime / originalDuration) * 80);
    if (pct !== lastProgress) {
      lastProgress = pct;
      onProgress(pct);
    }

    rafId = requestAnimationFrame(drawFrame);
  };

  rafId = requestAnimationFrame(drawFrame);

  // Handle video end
  video.onended = () => {
    if (recorder.state === 'recording') {
      setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 200);
    }
  };

  // Safety timeout: stop recording after duration + 5s buffer
  const safetyTimeout = setTimeout(() => {
    if (rafId) cancelAnimationFrame(rafId);
    if (recorder.state === 'recording') recorder.stop();
    video.pause();
  }, (originalDuration + 5) * 1000);

  const compressedBlob = await compressionPromise;
  clearTimeout(safetyTimeout);
  if (rafId) cancelAnimationFrame(rafId);

  // Cleanup
  video.pause();
  video.src = '';
  URL.revokeObjectURL(videoUrl);

  onProgress(95);

  const compressedMB = compressedBlob.size / (1024 * 1024);
  const reductionPct = Math.round((1 - compressedBlob.size / videoFile.size) * 100);

  console.log(`[Compressor] ${originalMB.toFixed(1)}MB → ${compressedMB.toFixed(1)}MB (${reductionPct}% reduction) | ${outWidth}x${outHeight} | ${mimeType}`);

  onProgress(100);

  return {
    blob: compressedBlob,
    mimeType: mimeType.split(';')[0], // clean mime for upload
    originalMB,
    compressedMB,
    reductionPct,
    outputDimensions: { width: outWidth, height: outHeight },
  };
}

/**
 * iOS fallback: if MediaRecorder unavailable on this iOS version,
 * check if file is already small enough to send as-is.
 */
async function _iosSizeFallback(videoFile, onProgress) {
  onProgress(100);
  const mb = videoFile.size / (1024 * 1024);
  if (mb <= 50) {
    // Small enough — send as-is
    return {
      blob: videoFile,
      mimeType: videoFile.type || 'video/mp4',
      originalMB: mb,
      compressedMB: mb,
      reductionPct: 0,
      outputDimensions: { width: 0, height: 0 },
      iosFallback: true,
    };
  }
  // Too large — throw so pipeline shows trim message
  throw new Error('IOS_TOO_LARGE');
}

/**
 * Quick check: does this video need compression?
 * Skip compression for already-small files.
 */
export function needsCompression(videoFile) {
  const sizeMB = videoFile.size / (1024 * 1024);
  return sizeMB > COMPRESS_THRESHOLD_MB;
}

/**
 * Get a human-readable size string
 */
export function formatMB(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 100 ? `${Math.round(mb)}MB` : `${mb.toFixed(1)}MB`;
}
