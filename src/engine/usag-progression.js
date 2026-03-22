/**
 * usag-progression.js — USAG level progression requirements table.
 *
 * Source: USAG JO 2023-2028 Code of Points + Xcel Program Guide.
 * Used by Section IV of the BHPA prompt for level-up gap analysis.
 *
 * VERIFY comments flag items that should be cross-checked against
 * the official USAG rulebook before shipping to paying customers.
 */

export const USAG_PROGRESSION = {
  // ── JO Level 4 → Level 5 ─────────────────────────────────────────
  '4': {
    bars: {
      nextLevel: '5',
      requiredSkills: [
        'Kip',
        'Cast to horizontal',
        'Back hip circle',
        'Sole circle dismount or flyaway',
      ],
      executionStandards: [
        'Cast must reach horizontal — below is -0.10 to -0.50',
        'Kip: hips must reach bar cleanly',
        'Continuous rhythm expected between skills',
      ],
      srRequirements: [
        'One kip',
        'One cast to horizontal',
        'One circling element',
        'Dismount from bar',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Cast not reaching horizontal',
        'Kip with significant pike or leg separation',
        'Lack of continuous routine rhythm',
        'Dismount with insufficient height',
      ],
    },
    beam: {
      nextLevel: '5',
      requiredSkills: [
        'Leap or jump with 120°+ split',
        'Full turn on one foot',
        'Acro series (2 connected elements)',
        'Dismount with salto or aerial',
      ],
      executionStandards: [
        'Split leaps: minimum 120° at L5',
        'Balance checks deducted at -0.10 each',
        'Rhythm and composition matter at L5',
      ],
      srRequirements: [
        'Acro element with flight',
        'Dance passage (leap + jump connected)',
        'Full turn',
        'Dismount C value or higher', // VERIFY: confirm minimum dismount value for L5
      ],
      scoreThreshold: null,
      commonGaps: [
        'Split angle below 120°',
        'Balance checks on acro skills',
        'Hesitation between skills (rhythm breaks)',
        'Dismount control — steps and hops',
      ],
    },
    vault: {
      nextLevel: '5',
      requiredSkills: [
        'Handspring vault with post-flight',
      ],
      executionStandards: [
        'Block must repel from table with straight arms',
        'Post-flight: body must achieve stretch before landing',
        'Landing: controlled, minimal steps',
      ],
      srRequirements: [
        'Handspring vault or higher',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Insufficient block — bent arms on table',
        'Low post-flight height',
        'Deep squat or large step on landing',
        'Pre-flight: hips not reaching vertical',
      ],
    },
    floor: {
      nextLevel: '5',
      requiredSkills: [
        'Round-off back handspring (series)',
        'Front or back salto',
        'Split leap 120°+',
        'Full turn',
      ],
      executionStandards: [
        'Salto required in at least one tumbling pass',
        'Split minimum 120° (below: -0.10 to -0.20)',
        'Artistry and musicality evaluated',
      ],
      srRequirements: [
        'Two different acro passes',
        'Salto in at least one pass',
        'Dance passage with leap 120°+',
        'Full turn',
      ],
      scoreThreshold: null,
      commonGaps: [
        'No salto yet — still doing BHS series only',
        'Split leap below 120°',
        'Landing control on tumbling',
        'Musicality and expression lacking',
      ],
    },
  },

  // ── JO Level 5 → Level 6 ─────────────────────────────────────────
  '5': {
    bars: {
      nextLevel: '6',
      requiredSkills: [
        'Kip',
        'Cast to horizontal',
        'Back hip circle or clear hip circle',
        'Bar change (squat-on, underswing, or glide)',
        'B-value element',
        'Flyaway dismount',
      ],
      executionStandards: [
        'Cast must reach horizontal consistently',
        'B-value element required (e.g. long hang kip, clear hip)',
        'Flyaway: full rotation, controlled landing',
      ],
      srRequirements: [
        'Two kips',
        'Cast to horizontal',
        'B-value element',
        'Bar change',
        'Flyaway dismount',
      ],
      scoreThreshold: null,
      commonGaps: [
        'No B-value element yet',
        'Flyaway rotation or landing control',
        'Cast amplitude inconsistent',
        'Bar change with heavy feet or stumble',
      ],
    },
    beam: {
      nextLevel: '6',
      requiredSkills: [
        'Acro series with flight element',
        'Split leap 120°+',
        'Full turn',
        'Back walkover or back handspring',
        'Cartwheel or round-off dismount connection',
      ],
      executionStandards: [
        'Acro series required (two connected acro elements)',
        'Dance passage: connected leap + jump',
        'Dismount: C-value or higher',
      ],
      srRequirements: [
        'Two acro elements (one with flight)',
        'Dance passage',
        'Full turn',
        'Dismount',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Acro series: skills not connected or hesitation between',
        'Split angle below 120° on dance elements',
        'Dismount: insufficient difficulty or control',
        'Balance adjustments through routine',
      ],
    },
    vault: {
      nextLevel: '6',
      requiredSkills: [
        'Handspring vault with clean post-flight',
      ],
      executionStandards: [
        'Block with straight arms required',
        'Post-flight: above horizontal',
        'Landing: minimal deductions',
      ],
      srRequirements: [
        'Handspring vault',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Bent arms during block phase',
        'Low post-flight',
        'Chest forward on landing',
        'Speed and power on run',
      ],
    },
    floor: {
      nextLevel: '6',
      requiredSkills: [
        'Two different tumbling passes with saltos',
        'Back tuck or back layout',
        'Dance passage with connected leaps',
        'Full turn',
      ],
      executionStandards: [
        'Salto required in both tumbling passes',
        'Split 120°+ on all dance elements',
        'Artistry: musicality and expression',
      ],
      srRequirements: [
        'Two different acro passes',
        'Salto in both passes',
        'Dance passage with 120°+ leap',
        'Full turn',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Only one salto pass — second pass is BHS series',
        'Landing control on saltos',
        'Split angle inconsistent',
        'Choreography lacks variety',
      ],
    },
  },

  // ── JO Level 6 → Level 7 ─────────────────────────────────────────
  '6': {
    bars: {
      nextLevel: '7',
      requiredSkills: [
        'Cast ABOVE horizontal',
        'B-value element minimum',
        'Clear hip circle to handstand', // VERIFY: confirm if required at L7 or just valued
        'Flyaway with layout or twist',
      ],
      executionStandards: [
        'Cast must be ABOVE horizontal — at horizontal is -0.10, below is -0.30',
        'B-value minimum on all circling',
        'Amplitude standards increase significantly',
      ],
      srRequirements: [
        'Cast above horizontal',
        'B-value element',
        'Bar change element',
        'Dismount B-value or higher',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Cast only reaching horizontal, not above',
        'No layout or twist on flyaway',
        'Clear hip not reaching handstand',
        'Rhythm breaks between skills',
      ],
    },
    beam: {
      nextLevel: '7',
      requiredSkills: [
        'Acro series with two flight elements',
        'Dance series (leap + leap or leap + jump connected)',
        'Back handspring or back tuck on beam',
        'Full turn',
        'B-value dismount minimum',
      ],
      executionStandards: [
        'Acro series must include flight in both elements',
        'Dance elements: 150°+ split expected',
        'Dismount: B-value minimum, controlled landing',
      ],
      srRequirements: [
        'Acro series with two flight elements',
        'Dance series (two connected dance elements)',
        'Full turn',
        'B-value dismount',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Acro series: only one flight element (e.g. walkover + handspring)',
        'Split not reaching 150° on leaps',
        'Back tuck on beam not yet consistent',
        'Dismount difficulty insufficient',
      ],
    },
    vault: {
      nextLevel: '7',
      requiredSkills: [
        'Handspring vault with higher post-flight',
        'Tsukahara or Yurchenko entry possible', // VERIFY: confirm if L7 requires entry change
      ],
      executionStandards: [
        'Post-flight: above horizontal with body tension',
        'Landing: stick or minimal step',
        'Speed and power on approach',
      ],
      srRequirements: [
        'Vault from FIG table — B-value minimum', // VERIFY: confirm minimum vault value at L7
      ],
      scoreThreshold: null,
      commonGaps: [
        'Post-flight height insufficient',
        'Body tension lost in post-flight',
        'Landing: chest drops forward',
        'Run speed not translating to vault power',
      ],
    },
    floor: {
      nextLevel: '7',
      requiredSkills: [
        'Two tumbling passes with saltos',
        'One pass with salto + full twist or higher',
        'Dance passage with 150°+ split',
        'Full turn (double turn valued)',
      ],
      executionStandards: [
        'One pass must include a salto with full twist or higher',
        'Split 150°+ on primary dance elements',
        'Artistry and choreography variety expected',
      ],
      srRequirements: [
        'Salto with full twist in one pass',
        'Two different acro passes',
        'Dance passage with 150°+ leap',
        'Full turn',
      ],
      scoreThreshold: null,
      commonGaps: [
        'No full twist yet — only back tuck/layout',
        'Split not reaching 150°',
        'Landing control on twist',
        'Choreography does not show level-appropriate maturity',
      ],
    },
  },

  // ── JO Level 7 → Level 8 ─────────────────────────────────────────
  '7': {
    bars: {
      nextLevel: '8',
      requiredSkills: [
        'Cast to handstand',
        'Release move or pirouette (C-value)',
        'Clear hip to handstand',
        'Stalder or toe-on circle', // VERIFY: confirm if required or just valued
        'Layout flyaway or higher dismount',
      ],
      executionStandards: [
        'Casts to handstand expected on every cast',
        'Amplitude deductions aggressive — below handstand is -0.30',
        'C-level skills expected',
      ],
      srRequirements: [
        'Cast to handstand',
        'Release move or pirouette',
        'B+ circling elements',
        'C-value dismount',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Cast not reaching handstand consistently',
        'No release move — only circling',
        'Clear hip stalls before handstand',
        'Dismount difficulty below C',
      ],
    },
    beam: {
      nextLevel: '8',
      requiredSkills: [
        'Acro series with flight',
        'Back tuck or back layout on beam',
        'Dance series with 180° split',
        'Difficult turns (1.5 or double)',
        'C-value dismount',
      ],
      executionStandards: [
        'Split: 180° expected at L8',
        'Acro: flight elements with height and control',
        'Overall composition and rhythm evaluated closely',
      ],
      srRequirements: [
        'Acro series with flight',
        'Dance series',
        'C-value dismount',
        'Difficulty turns',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Split not reaching 180°',
        'Back tuck inconsistent — falls or wobbles',
        'Dismount below C-value',
        'Turn difficulty below 1.5 rotations',
      ],
    },
    vault: {
      nextLevel: '8',
      requiredSkills: [
        'B-value vault minimum',
        'Yurchenko or Tsukahara entry', // VERIFY: confirm if entry type is mandated at L8
      ],
      executionStandards: [
        'Post-flight: well above horizontal',
        'Landing: near-stick expected',
        'Body shape clean through all phases',
      ],
      srRequirements: [
        'B-value vault from FIG table',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Vault difficulty below B-value',
        'Entry technique (round-off onto board)',
        'Post-flight shape breaks',
        'Landing control',
      ],
    },
    floor: {
      nextLevel: '8',
      requiredSkills: [
        'C-level saltos (e.g. full twist, double back)',
        'Two passes with C+ difficulty',
        'Dance with 180° splits',
        'Double or triple turn',
      ],
      executionStandards: [
        'Salto difficulty C-level minimum expected',
        'Landing control on high-difficulty passes',
        'Artistry: full choreographic expression',
      ],
      srRequirements: [
        'C-level salto in at least one pass',
        'Two different acro passes',
        'Dance passage with 180° leap',
        'Difficulty turn (1.5+ rotations)',
      ],
      scoreThreshold: null,
      commonGaps: [
        'No C-level salto yet (only back layout/full)',
        'Landing control on difficulty passes',
        'Split not reaching 180°',
        'Choreography lacks Level 8 maturity',
      ],
    },
  },

  // ── JO Level 8 (terminal for beta — no L9 progression) ───────────
  '8': {
    bars: { nextLevel: '9', requiredSkills: ['Level 9+ requirements outside beta scope'], executionStandards: [], srRequirements: [], scoreThreshold: null, commonGaps: ['Level 9 progression coming soon'] },
    beam: { nextLevel: '9', requiredSkills: ['Level 9+ requirements outside beta scope'], executionStandards: [], srRequirements: [], scoreThreshold: null, commonGaps: ['Level 9 progression coming soon'] },
    vault: { nextLevel: '9', requiredSkills: ['Level 9+ requirements outside beta scope'], executionStandards: [], srRequirements: [], scoreThreshold: null, commonGaps: ['Level 9 progression coming soon'] },
    floor: { nextLevel: '9', requiredSkills: ['Level 9+ requirements outside beta scope'], executionStandards: [], srRequirements: [], scoreThreshold: null, commonGaps: ['Level 9 progression coming soon'] },
  },

  // ── Xcel Bronze → Silver ──────────────────────────────────────────
  'xcel_bronze': {
    bars: {
      nextLevel: 'xcel_silver',
      requiredSkills: ['Kip', 'Cast approaching horizontal', 'Circling element', 'Bar change', 'Dismount'],
      executionStandards: ['Cast should approach horizontal — below 45° is -0.10', 'Kip must be clean'],
      srRequirements: ['Kip + cast + circling + bar change + dismount'],
      scoreThreshold: null,
      commonGaps: ['Kip not yet clean', 'Cast well below horizontal', 'Dismount control'],
    },
    beam: {
      nextLevel: 'xcel_silver',
      requiredSkills: ['Two acro elements', 'Dance passage with 90° split', 'Full turn', 'Dismount'],
      executionStandards: ['Split minimum 90°', 'Balance checks deducted'],
      srRequirements: ['Two acro elements', 'Dance passage', 'Full turn', 'Dismount'],
      scoreThreshold: null,
      commonGaps: ['Split below 90°', 'Acro elements lack confidence', 'Balance checks'],
    },
    vault: {
      nextLevel: 'xcel_silver',
      requiredSkills: ['Handspring vault'],
      executionStandards: ['Block with arm extension', 'Post-flight with body tension'],
      srRequirements: ['FIG A-level vault'],
      scoreThreshold: null,
      commonGaps: ['Bent arms on table', 'Low post-flight', 'Landing control'],
    },
    floor: {
      nextLevel: 'xcel_silver',
      requiredSkills: ['Two acro elements (one with flight)', 'Dance passage with 90° split', 'Full turn'],
      executionStandards: ['One acro with flight required', 'Split 90°+'],
      srRequirements: ['Two acro elements', 'One with flight', 'Dance passage 90°+', 'Full turn'],
      scoreThreshold: null,
      commonGaps: ['No flight element in acro', 'Split below 90°', 'Landing control'],
    },
  },

  // ── Xcel Silver → Gold ────────────────────────────────────────────
  'xcel_silver': {
    bars: {
      nextLevel: 'xcel_gold',
      requiredSkills: ['Two kips', 'Two 360° circling elements', 'Bar change', 'Dismount from high bar'],
      executionStandards: ['Cast must reach horizontal (180°)', 'Below 170°: -0.30 + SR not awarded'],
      srRequirements: ['Two kips', 'Two 360° circles', 'Bar change', 'Dismount from HB'],
      scoreThreshold: null,
      commonGaps: ['Only one kip', 'Cast below horizontal', 'No dismount from high bar', 'Circle technique'],
    },
    beam: {
      nextLevel: 'xcel_gold',
      requiredSkills: ['Two acro elements (one series)', 'Dance passage with 120° split', 'Full turn', 'Dismount'],
      executionStandards: ['Leaps/jumps must reach 120°', 'Acro series required'],
      srRequirements: ['Acro series', 'Dance passage 120°+', 'Full turn', 'Dismount'],
      scoreThreshold: null,
      commonGaps: ['No acro series yet (skills not connected)', 'Split below 120°', 'Dismount difficulty'],
    },
    vault: {
      nextLevel: 'xcel_gold',
      requiredSkills: ['A-level vault'],
      executionStandards: ['Block and post-flight form', 'Landing control'],
      srRequirements: ['A-level vault'],
      scoreThreshold: null,
      commonGaps: ['Post-flight too low', 'Landing deductions', 'Body shape in flight'],
    },
    floor: {
      nextLevel: 'xcel_gold',
      requiredSkills: ['Two acro passes (one with two flight elements)', 'Dance passage with 120° split', 'Full turn'],
      executionStandards: ['Split 120°+ required', 'Two flight elements in one pass'],
      srRequirements: ['Two acro passes', 'One with two flight elements', 'Dance 120°+', 'Full turn'],
      scoreThreshold: null,
      commonGaps: ['Only one flight element per pass', 'Split below 120°', 'Tumbling landing control'],
    },
  },

  // ── Xcel Gold → Platinum ──────────────────────────────────────────
  'xcel_gold': {
    bars: {
      nextLevel: 'xcel_platinum',
      requiredSkills: ['Two kips', 'One B-value element', 'Two 360° circles', 'Bar change', 'Dismount from HB'],
      executionStandards: ['Cast must be ABOVE horizontal (>180°)', 'At horizontal: -0.10', 'Below: -0.30 + SR denied'],
      srRequirements: ['B-value element required', 'Cast above horizontal', 'Bar change', 'Dismount'],
      scoreThreshold: null,
      commonGaps: ['No B-value element', 'Cast only at horizontal, not above', 'Dismount difficulty', 'Rhythm between skills'],
    },
    beam: {
      nextLevel: 'xcel_platinum',
      requiredSkills: ['Two acro elements (one series with flight)', 'Dance passage', 'Full turn', 'Dismount'],
      executionStandards: ['Acro series must include flight element', 'Split 120°+ on dance'],
      srRequirements: ['Acro series with flight', 'Dance passage', 'Full turn', 'Dismount'],
      scoreThreshold: null,
      commonGaps: ['Acro series lacks flight element', 'Inconsistent balance', 'Split below 120°'],
    },
    vault: {
      nextLevel: 'xcel_platinum',
      requiredSkills: ['Handspring vault or higher'],
      executionStandards: ['Post-flight above horizontal', 'Clean body shape', 'Controlled landing'],
      srRequirements: ['A-level vault or higher'],
      scoreThreshold: null,
      commonGaps: ['Post-flight too low', 'Body shape breaks', 'Landing with large steps'],
    },
    floor: {
      nextLevel: 'xcel_platinum',
      requiredSkills: ['Two acro passes (one with salto)', 'Dance passage with 120° split', 'Full turn'],
      executionStandards: ['Salto required in one pass', 'Split 120°+'],
      srRequirements: ['Salto in one pass', 'Two acro passes', 'Dance 120°+', 'Full turn'],
      scoreThreshold: null,
      commonGaps: ['No salto yet', 'Split inconsistent', 'Tumbling pass connection', 'Landing control on salto'],
    },
  },

  // ── Xcel Platinum (terminal for beta) ─────────────────────────────
  'xcel_platinum': {
    bars: { nextLevel: 'xcel_diamond', requiredSkills: ['Diamond requirements outside beta scope'], executionStandards: [], srRequirements: [], scoreThreshold: null, commonGaps: ['Diamond progression coming soon'] },
    beam: { nextLevel: 'xcel_diamond', requiredSkills: ['Diamond requirements outside beta scope'], executionStandards: [], srRequirements: [], scoreThreshold: null, commonGaps: ['Diamond progression coming soon'] },
    vault: { nextLevel: 'xcel_diamond', requiredSkills: ['Diamond requirements outside beta scope'], executionStandards: [], srRequirements: [], scoreThreshold: null, commonGaps: ['Diamond progression coming soon'] },
    floor: { nextLevel: 'xcel_diamond', requiredSkills: ['Diamond requirements outside beta scope'], executionStandards: [], srRequirements: [], scoreThreshold: null, commonGaps: ['Diamond progression coming soon'] },
  },
};

/**
 * Get progression data for a given level and event.
 * Normalizes level strings to match table keys.
 */
export function getProgression(level, event) {
  if (!level || !event) return null;
  const l = level.toLowerCase().replace(/\s+/g, '_').replace(/^level_?/, '').replace(/^jo_?level_?/, '');
  const e = event.toLowerCase().replace(/uneven\s*/i, '').replace(/balance\s*/i, '').replace(/exercise/i, '').trim();
  const eventMap = { 'bars': 'bars', 'beam': 'beam', 'vault': 'vault', 'floor': 'floor' };
  const eventKey = eventMap[e] || (e.includes('bar') ? 'bars' : e.includes('beam') ? 'beam' : e.includes('vault') ? 'vault' : e.includes('floor') ? 'floor' : null);
  if (!eventKey) return null;

  // Try exact match first
  if (USAG_PROGRESSION[l]?.[eventKey]) return USAG_PROGRESSION[l][eventKey];

  // Try numeric
  const num = parseInt(l, 10);
  if (!isNaN(num) && USAG_PROGRESSION[String(num)]?.[eventKey]) return USAG_PROGRESSION[String(num)][eventKey];

  return null;
}
