/**
 * videoClipper.js — extracts short base64 WebM clips around skill windows for Gemini.
 */
const PRE_BUFFER = 0.5, POST_BUFFER = 0.8, MAX_DURATION = 8.0;

export async function extractSkillClip(video, skillStart, skillEnd) {
  return new Promise(async (resolve) => {
    try {
      const clipStart    = Math.max(0, skillStart - PRE_BUFFER);
      const clipEnd      = Math.min(video.duration, skillEnd + POST_BUFFER);
      const clipDuration = Math.min(clipEnd - clipStart, MAX_DURATION);

      video.currentTime = clipStart;
      await new Promise(r => { video.onseeked = r; });

      const stream = video.captureStream?.() || video.mozCaptureStream?.();
      if (!stream) { resolve(null); return; }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9' : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => resolve({ base64: reader.result.split(',')[1], mimeType: 'video/webm', duration: clipDuration });
        reader.readAsDataURL(blob);
      };

      recorder.start();
      video.play();
      setTimeout(() => { recorder.stop(); video.pause(); }, clipDuration * 1000);
    } catch (e) {
      console.warn('[videoClipper]', e.message);
      resolve(null);
    }
  });
}

export async function extractAllSkillClips(video, skills, onProgress = null) {
  const clips = [];
  for (let i = 0; i < skills.length; i++) {
    clips.push(await extractSkillClip(video, skills[i].start, skills[i].end));
    if (onProgress) onProgress(i + 1, skills.length);
  }
  return clips;
}
