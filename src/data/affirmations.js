// ─── DAILY AFFIRMATIONS & INSPIRATION ────────────────────────────
// Rotates based on day of year so every day feels fresh

const AFFIRMATIONS = {
  general: [
    "I have trained for this. My body knows what to do.",
    "I am strong, I am prepared, I am ready.",
    "Mistakes don't define me. I recover and keep going.",
    "I compete for myself, not against anyone else.",
    "I trust my training. I trust my coach. I trust myself.",
    "Nervous energy is just excitement. I channel it into power.",
    "Every routine is a chance to show what I can do.",
    "I breathe, I focus, I perform. That's all I need to do.",
    "The work I've put in is already done. Now I just enjoy it.",
    "I am more than my score. I am an athlete who never quits.",
    "Today I perform with confidence and joy.",
    "My body is strong. My mind is stronger.",
    "I choose courage over comfort today.",
    "Progress is my competition. Yesterday's me is who I beat.",
    "I was built for this moment.",
  ],
  landing: [
    "Stick it. Hold it. Own it. Landings win meets.",
    "My ankles are strong. My core is tight. I absorb and hold.",
    "Every landing is a chance to show control and power.",
    "I drive my chest up, arms high, and freeze. That's my finish.",
    "The 0.20 I save on landings is worth more than any new skill.",
  ],
  toePoint: [
    "Toes pointed from takeoff to landing. It's automatic now.",
    "My feet tell a story of precision. Every point matters.",
    "Flexed feet are behind me. I point through every skill.",
  ],
  kneeControl: [
    "My legs are locked, tight, and together. Like a pencil in flight.",
    "Knee tension is my superpower. Judges notice when it's right.",
    "Squeeze, extend, control. My legs are a straight line.",
  ],
  mentalFocus: [
    "When I salute the judge, I leave everything else behind.",
    "Pressure makes diamonds. I rise to the moment.",
    "I see the routine perfect in my mind. Now I just follow the image.",
    "One skill at a time. That's all there ever is.",
    "My breathing is calm. My focus is sharp. I'm ready.",
  ],
  preCompetition: [
    "Today is the day I've been preparing for. I'm ready.",
    "I walk into this gym knowing I belong here.",
    "The judges don't know my journey. I perform for me.",
    "Every warm-up rep is a promise to myself: I've got this.",
    "Whatever happens today, I'll be proud that I showed up and competed.",
  ],
};

// Get a context-appropriate affirmation based on athlete's situation
export function getDailyAffirmation(context = {}) {
  const { weakestArea, daysToMeet, dayOfYear } = context;
  const day = dayOfYear || Math.floor(Date.now() / 86400000);
  
  // If meet is within 48 hours, use pre-competition
  if (daysToMeet !== undefined && daysToMeet <= 2) {
    return AFFIRMATIONS.preCompetition[day % AFFIRMATIONS.preCompetition.length];
  }
  
  // If there's a known weak area, mix in targeted affirmations
  if (weakestArea) {
    const pool = AFFIRMATIONS[weakestArea] || AFFIRMATIONS.general;
    // 60% chance of targeted, 40% general
    if (day % 5 < 3 && pool.length > 0) {
      return pool[day % pool.length];
    }
  }
  
  return AFFIRMATIONS.general[day % AFFIRMATIONS.general.length];
}

// Get focus message based on current training priorities
export function getDailyFocus(context = {}) {
  const { topFault, improvementTrend, weeklyGoal } = context;
  
  if (weeklyGoal) {
    return `This week: ${weeklyGoal}`;
  }
  
  if (topFault) {
    const focuses = {
      landing: "Focus this week: Landing control — stick every dismount",
      toePoint: "Focus this week: Toe point — it's worth 0.30+ per routine",
      kneeControl: "Focus this week: Knee tension — lock and squeeze",
      alignment: "Focus this week: Body alignment — straight lines everywhere",
      split: "Focus this week: Split amplitude — push for that extra 10°",
    };
    return focuses[topFault] || `Focus this week: ${topFault}`;
  }
  
  if (improvementTrend > 0) {
    return `You're on a roll — score up +${improvementTrend.toFixed(2)} recently!`;
  }
  
  return "Every practice is a chance to improve. Show up and give it your all.";
}

// Pillar-specific daily inspiration (used in Training Program)
export function getDailyInspiration(pillar) {
  const day = Math.floor(Date.now() / 86400000);
  const inspirations = {
    drills: [
      "Perfection isn't doing extraordinary things — it's doing ordinary things with extraordinary consistency.",
      "The gymnast who practices 10 perfect cartwheels beats the one who practices 100 sloppy ones.",
      "Your body can only perform what it has practiced. Make every rep count.",
      "Drill the basics until the basics become brilliant.",
    ],
    strength: [
      "Strength isn't just about big muscles — it's about the control to hold perfect form when you're tired.",
      "The strongest gymnasts aren't always the biggest. They're the ones who never compromise body tension.",
      "Core strength is the foundation of every single skill in gymnastics. Every. Single. One.",
    ],
    nutrition: [
      "You wouldn't put cheap gas in a race car. Fuel your body like the high-performance machine it is.",
      "What you eat today shows up in your performance tomorrow. Make good choices.",
      "Hydration isn't just about water. Electrolytes help your muscles fire and your brain focus.",
    ],
    mental: [
      "The difference between a 9.0 and a 9.3 is rarely physical — it's mental confidence.",
      "Simone Biles visualizes every routine before she performs it. If it works for the GOAT, it works for you.",
      "Your brain can't tell the difference between a vivid visualization and actually doing it. Use that power.",
    ],
    recovery: [
      "Rest is not the opposite of training. Rest IS training. Your muscles grow when you sleep.",
      "A gymnast who trains hard and recovers smart will always outperform one who just trains hard.",
      "Sleep is the best legal performance enhancer in sports. Aim for 9+ hours.",
    ],
  };
  
  const pool = inspirations[pillar] || inspirations.drills;
  return pool[day % pool.length];
}

export default AFFIRMATIONS;
