/**
 * skeletonOverlay.js
 * Draws a MediaPipe-style skeleton on a 2D canvas context.
 * Coordinates are normalized 0-1; pass canvas dimensions for scaling.
 */

const CONNECTIONS = [
  // Torso
  ['leftShoulder',  'rightShoulder'],
  ['leftShoulder',  'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip',       'rightHip'],
  // Left arm
  ['leftShoulder',  'leftElbow'],
  ['leftElbow',     'leftWrist'],
  // Right arm
  ['rightShoulder', 'rightElbow'],
  ['rightElbow',    'rightWrist'],
  // Left leg
  ['leftHip',       'leftKnee'],
  ['leftKnee',      'leftAnkle'],
  // Right leg
  ['rightHip',      'rightKnee'],
  ['rightKnee',     'rightAnkle'],
];

const JOINT_COLORS = {
  leftShoulder:  '#C4982A',
  rightShoulder: '#C4982A',
  leftElbow:     '#E8C35A',
  rightElbow:    '#E8C35A',
  leftWrist:     '#F5E6B8',
  rightWrist:    '#F5E6B8',
  leftHip:       '#3B82F6',
  rightHip:      '#3B82F6',
  leftKnee:      '#60A5FA',
  rightKnee:     '#60A5FA',
  leftAnkle:     '#93C5FD',
  rightAnkle:    '#93C5FD',
};

/**
 * Draw skeleton on canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} joints        – named joints {x, y} normalized 0-1
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {Object} [options]
 */
export function drawSkeleton(ctx, joints, canvasWidth, canvasHeight, options = {}) {
  const {
    lineWidth       = 2.5,
    jointRadius     = 5,
    lineColor       = 'rgba(196, 152, 42, 0.85)',
    alpha           = 0.9,
  } = options;

  if (!joints) return;

  const toX = (x) => x * canvasWidth;
  const toY = (y) => y * canvasHeight;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Draw bones
  ctx.lineWidth   = lineWidth;
  ctx.lineCap     = 'round';

  for (const [a, b] of CONNECTIONS) {
    const p1 = joints[a];
    const p2 = joints[b];
    if (!p1 || !p2) continue;
    if ((p1.visibility || 0) < 0.3 || (p2.visibility || 0) < 0.3) continue;

    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.moveTo(toX(p1.x), toY(p1.y));
    ctx.lineTo(toX(p2.x), toY(p2.y));
    ctx.stroke();
  }

  // Draw joints
  for (const [name, joint] of Object.entries(joints)) {
    if (!joint || (joint.visibility || 0) < 0.3) continue;
    // Skip midpoints (no color defined) as they're implied by bones
    const color = JOINT_COLORS[name] || '#ffffff';

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(toX(joint.x), toY(joint.y), jointRadius, 0, Math.PI * 2);
    ctx.fill();

    // White center dot for clarity
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.arc(toX(joint.x), toY(joint.y), jointRadius * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw angle labels next to key joints.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} joints
 * @param {Object} biomechanics  – output from computeBiomechanics()
 * @param {number} w
 * @param {number} h
 */
export function drawAngles(ctx, joints, biomechanics, w, h) {
  if (!joints || !biomechanics) return;

  const labels = [
    { joint: 'knee',     value: biomechanics.kneeAngle,     label: 'Knee' },
    { joint: 'hip',      value: biomechanics.hipAngle,      label: 'Hip' },
    { joint: 'shoulder', value: biomechanics.shoulderAngle, label: 'Shoulder' },
  ];

  ctx.save();
  ctx.font      = 'bold 11px Outfit, sans-serif';
  ctx.textAlign = 'left';

  for (const { joint, value, label } of labels) {
    const j = joints[joint];
    if (!j || value === null) continue;

    const x = j.x * w + 10;
    const y = j.y * h - 6;

    const color = value < 130 ? '#EF4444' : value < 155 ? '#F59E0B' : '#22C55E';

    // Background pill
    const text = `${label}: ${Math.round(value)}°`;
    const tw   = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(11, 16, 36, 0.75)';
    ctx.beginPath();
    ctx.roundRect(x - 4, y - 13, tw + 8, 17, 4);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  ctx.restore();
}

/**
 * Draw a progress bar-style timeline marker on the canvas.
 */
export function drawTimestamp(ctx, timestamp, w, h) {
  ctx.save();
  ctx.font      = 'bold 13px Space Mono, monospace';
  ctx.fillStyle = 'rgba(11, 16, 36, 0.7)';
  ctx.fillRect(8, 8, 68, 22);
  ctx.fillStyle = '#C4982A';
  ctx.textAlign = 'left';
  ctx.fillText(formatTime(timestamp), 12, 24);
  ctx.restore();
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}
