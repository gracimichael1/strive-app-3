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

  // ── JO Level 8 → Level 9 ─────────────────────────────────────────
  '8': {
    bars: {
      nextLevel: '9',
      requiredSkills: [
        'Cast to handstand on every cast', // VERIFY: confirm L9 cast standard
        'D-value release move (Tkatchev, Gienger, or equivalent)', // VERIFY: confirm common D releases at L9
        'Pirouette on bars (clear hip full pirouette or stalder full)', // VERIFY
        'D-value dismount (double back or double twist flyaway)', // VERIFY
      ],
      executionStandards: [
        'Cast to handstand mandatory — any deviation is -0.30+',
        'D-value elements required for competitive L9 scoring',
        'Rhythm and amplitude judged at elite standard',
      ],
      srRequirements: [
        'Cast to handstand', // VERIFY: confirm L9 bar SR
        'Release move',
        'Pirouette or turning element',
        'D-value dismount',
      ],
      scoreThreshold: null,
      commonGaps: [
        'No D-value release — only C-value',
        'Pirouette not yet consistent',
        'Dismount below D-value',
        'Cast handstand consistency under fatigue',
      ],
    },
    beam: {
      nextLevel: '9',
      requiredSkills: [
        'Acro series with two flight elements', // VERIFY: confirm L9 acro series requirement
        'Dance series with 180°+ split leaps',
        'Difficult turn (1.5 or double)', // VERIFY: confirm L9 turn requirement
        'D-value dismount', // VERIFY
      ],
      executionStandards: [
        'Split 180° minimum on all dance',
        'Acro flight series with height and control',
        'Artistry and expression at advanced optional standard',
      ],
      srRequirements: [
        'Acro series with flight', // VERIFY: confirm exact L9 beam SR
        'Dance series',
        'Difficulty turn',
        'D-value dismount',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Acro series: insufficient flight',
        'Split not consistently at 180°',
        'Turn difficulty below 1.5',
        'Dismount below D-value',
      ],
    },
    vault: {
      nextLevel: '9',
      requiredSkills: [
        'Yurchenko layout or Tsukahara layout', // VERIFY: confirm L9 vault minimum
        'Post-flight height well above horizontal',
      ],
      executionStandards: [
        'Layout position mandatory — tuck is insufficient',
        'Post-flight height significant',
        'Landing: stick or minimal step',
      ],
      srRequirements: [
        'C-value vault minimum', // VERIFY: confirm minimum vault SV at L9
      ],
      scoreThreshold: null,
      commonGaps: [
        'Still performing Yurchenko tuck — need layout',
        'Post-flight height insufficient',
        'Body shape breaks in layout',
        'Landing deductions',
      ],
    },
    floor: {
      nextLevel: '9',
      requiredSkills: [
        'D-value tumbling pass (double back, double twist)', // VERIFY: confirm common D-value floor skills at L9
        'Two passes with C+ difficulty',
        'Dance series with 180° splits',
        'Double or 2.5 turn', // VERIFY
      ],
      executionStandards: [
        'D-value salto in at least one pass',
        'C+ difficulty in remaining passes',
        'Full choreographic expression — elite artistry',
      ],
      srRequirements: [
        'D-value pass', // VERIFY: confirm L9 floor SR
        'Two acro passes with C+ elements',
        'Dance passage 180°+',
        'Difficulty turn',
      ],
      scoreThreshold: null,
      commonGaps: [
        'No D-value salto — only C-value (full twist)',
        'Second pass below C-value',
        'Split inconsistent at 180°',
        'Choreography not at Level 9 maturity',
      ],
    },
  },

  // ── JO Level 9 → Level 10 ────────────────────────────────────────
  '9': {
    bars: {
      nextLevel: '10',
      requiredSkills: [
        'D+ release moves (Tkatchev variations, Pak salto)', // VERIFY: confirm L10 bar expectations
        'E-value dismount or D+D combination', // VERIFY
        'Multiple pirouettes',
        'Cast to handstand — perfect every time',
      ],
      executionStandards: [
        'Near-perfect execution on all elements',
        'E-value difficulty expected for competitive L10',
        'Composition and connection value evaluated',
      ],
      srRequirements: [
        'D+ release', // VERIFY: confirm L10 bar SR
        'D+ dismount',
        'Connection value between skills',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Release difficulty below D+ level',
        'Dismount value insufficient',
        'Connection value not maximized',
        'Execution errors on high-difficulty skills',
      ],
    },
    beam: {
      nextLevel: '10',
      requiredSkills: [
        'D+ acro series with flight', // VERIFY
        'Dance series with 180° split leaps',
        'Double turn or higher', // VERIFY
        'D+ dismount (double back or equivalent)', // VERIFY
      ],
      executionStandards: [
        'Split 180° minimum — below is automatic deduction',
        'D+ difficulty expected for competitive L10',
        'Composition and artistry at national standard',
      ],
      srRequirements: [
        'D+ acro', // VERIFY: confirm L10 beam SR
        'Dance series',
        'D+ dismount',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Acro difficulty below D+',
        'Dismount below D+',
        'Consistency under pressure',
        'Artistry not at L10 national standard',
      ],
    },
    vault: {
      nextLevel: '10',
      requiredSkills: [
        'Yurchenko layout full or higher', // VERIFY: confirm L10 vault expectations
      ],
      executionStandards: [
        'Full twist in layout position minimum',
        'Post-flight: exceptional height',
        'Landing: stick expected',
      ],
      srRequirements: [
        'D-value vault minimum', // VERIFY: confirm L10 minimum vault SV
      ],
      scoreThreshold: null,
      commonGaps: [
        'Still performing Yurchenko layout — need full twist',
        'Post-flight height or distance insufficient',
        'Twist incomplete or late',
        'Landing deductions',
      ],
    },
    floor: {
      nextLevel: '10',
      requiredSkills: [
        'E-value tumbling (double layout, double Arabian, etc.)', // VERIFY: confirm common E-value floor skills
        'D+ passes throughout',
        'Dance with 180°+ split',
        '2.5 or triple turn', // VERIFY
      ],
      executionStandards: [
        'E-value salto expected for competitive L10',
        'D+ difficulty throughout routine',
        'National-level artistry and expression',
      ],
      srRequirements: [
        'E-value tumbling', // VERIFY: confirm L10 floor SR
        'D+ second pass',
        'Dance series 180°+',
        'Difficulty turn',
      ],
      scoreThreshold: null,
      commonGaps: [
        'No E-value salto yet',
        'Difficulty gap in second and third passes',
        'Artistry and choreography not at national L10 standard',
        'Stamina — execution drops on final pass',
      ],
    },
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

  // ── Xcel Platinum → Diamond ───────────────────────────────────────
  'xcel_platinum': {
    bars: {
      nextLevel: 'xcel_diamond',
      requiredSkills: [
        'Cast to handstand (within 10° of vertical)',
        'C-value circling skill (clear hip handstand, stalder, toe-on)',
        'C-value dismount (layout flyaway with twist or higher)',
      ],
      executionStandards: [
        'Cast to handstand expected — below handstand is -0.30+',
        'C-value elements required for Diamond SR',
        'Rhythm and flow between skills judged strictly',
      ],
      srRequirements: [
        'Cast to handstand',
        'C-value skill',
        'C-value dismount',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Cast not reaching handstand consistently',
        'No C-value circling element — only B-value',
        'Dismount below C-value',
        'Rhythm breaks between skills',
      ],
    },
    beam: {
      nextLevel: 'xcel_diamond',
      requiredSkills: [
        'Acro series with flight element (two connected, at least one with flight)',
        'Leap or jump with 180°+ split',
        'Full turn (360°) on one foot',
        'C-value dismount',
      ],
      executionStandards: [
        'Split must reach 180° — below 170° is significant deduction',
        'Acro series requires flight in at least one element',
        'C-value dismount with controlled landing',
      ],
      srRequirements: [
        'Acro series with flight',
        'Leap/jump 180°+',
        'Full turn',
        'C-value dismount',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Acro series lacks flight element',
        'Split not reaching 180°',
        'Dismount below C-value',
        'Balance adjustments through routine',
      ],
    },
    vault: {
      nextLevel: 'xcel_diamond',
      requiredSkills: [
        'Yurchenko or Tsukahara entry vault',
        'Post-flight with clear height and body tension',
      ],
      executionStandards: [
        'Block from table must show power',
        'Post-flight: well above horizontal',
        'Landing: near-stick expected at Diamond',
      ],
      srRequirements: [
        'Yurchenko or Tsukahara entry',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Still performing handspring vault — need Yurchenko/Tsuk entry',
        'Post-flight too low',
        'Body shape breaks in post-flight',
        'Landing control',
      ],
    },
    floor: {
      nextLevel: 'xcel_diamond',
      requiredSkills: [
        'C-value tumbling pass (layout, full twist, or connected saltos)',
        'Dance series with leap/jump showing 180°+ split',
        'Full turn (360°) on one foot',
        'C-value final tumbling pass',
      ],
      executionStandards: [
        'C-value salto in at least one pass',
        'Split 180°+ on primary dance elements',
        'Artistry and expression heavily weighted',
      ],
      srRequirements: [
        'C-value tumbling pass',
        'Dance series 180°+',
        'Full turn',
        'C-value final pass',
      ],
      scoreThreshold: null,
      commonGaps: [
        'No C-value salto yet — only B-value (back tuck, back layout)',
        'Split not reaching 180°',
        'Final pass below C-value',
        'Artistry and choreography not Diamond-level',
      ],
    },
  },

  // ── Xcel Diamond → Sapphire ─────────────────────────────────────
  'xcel_diamond': {
    bars: {
      nextLevel: 'xcel_sapphire',
      requiredSkills: [
        'Cast to handstand (within 10° of vertical)',
        'D-value release move or pirouette',
        'D-value dismount',
      ],
      executionStandards: [
        'Cast to handstand mandatory — any deviation is significant',
        'D-value elements required for Sapphire SR',
        'Near-perfect execution expected',
      ],
      srRequirements: [
        'Cast to handstand',
        'D-value release/pirouette',
        'D-value dismount',
      ],
      scoreThreshold: null,
      commonGaps: [
        'No D-value release — only C-value skills', // VERIFY: confirm D-value bar skills common at this transition
        'Dismount below D-value',
        'Execution errors on high-difficulty skills',
        'Cast handstand consistency',
      ],
    },
    beam: {
      nextLevel: 'xcel_sapphire',
      requiredSkills: [
        'Flight acro series (two connected elements, both with flight)',
        'Leap or jump with 180°+ split',
        'Full turn (360°) on one foot',
        'D-value acro skill or D-value dismount',
      ],
      executionStandards: [
        'Both elements in acro series must have flight',
        'Split 180° is minimum standard',
        'D-value difficulty required',
      ],
      srRequirements: [
        'Flight acro series (both with flight)',
        'Leap/jump 180°+',
        'Full turn',
        'D-value acro or dismount',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Acro series: only one element with flight',
        'No D-value acro skill on beam', // VERIFY: confirm common D-value beam skills at this transition
        'Dismount difficulty insufficient',
        'Execution errors on flight series',
      ],
    },
    vault: {
      nextLevel: 'xcel_sapphire',
      requiredSkills: [
        'Yurchenko layout or higher',
      ],
      executionStandards: [
        'Yurchenko tuck insufficient at Sapphire — layout minimum',
        'Post-flight: high, with full body tension',
        'Landing: controlled, near-stick',
      ],
      srRequirements: [
        'Yurchenko layout or higher',
      ],
      scoreThreshold: null,
      commonGaps: [
        'Still performing Yurchenko tuck — need layout',
        'Post-flight height insufficient for Sapphire',
        'Body shape breaks in layout position',
        'Landing deductions',
      ],
    },
    floor: {
      nextLevel: 'xcel_sapphire',
      requiredSkills: [
        'D-value tumbling pass (double back, double twist, or equivalent)',
        'Dance series with leap/jump showing 180°+ split',
        'Full turn (360°) on one foot — 1.5 turn preferred',
        'D-value final tumbling pass',
      ],
      executionStandards: [
        'D-value salto required in at least one pass',
        'Split 180° minimum',
        'Upper-optional artistry standard',
      ],
      srRequirements: [
        'D-value tumbling pass',
        'Dance series 180°+',
        'Full turn (1.5 preferred)',
        'D-value final pass',
      ],
      scoreThreshold: null,
      commonGaps: [
        'No D-value salto yet — only C-value (full twist, layout)', // VERIFY: confirm common D-value floor skills
        'Split inconsistent at 180°',
        'Final pass below D-value',
        'Artistry not at upper-optional standard',
      ],
    },
  },

  // ── Xcel Sapphire (highest Xcel level) ──────────────────────────
  'xcel_sapphire': {
    bars: { nextLevel: null, requiredSkills: ['Sapphire is the highest Xcel division — outside beta scope'], executionStandards: [], srRequirements: [], scoreThreshold: null, commonGaps: ['No higher Xcel level exists. Consider JO Level 9/10 track.'] },
    beam: { nextLevel: null, requiredSkills: ['Sapphire is the highest Xcel division — outside beta scope'], executionStandards: [], srRequirements: [], scoreThreshold: null, commonGaps: ['No higher Xcel level exists. Consider JO Level 9/10 track.'] },
    vault: { nextLevel: null, requiredSkills: ['Sapphire is the highest Xcel division — outside beta scope'], executionStandards: [], srRequirements: [], scoreThreshold: null, commonGaps: ['No higher Xcel level exists. Consider JO Level 9/10 track.'] },
    floor: { nextLevel: null, requiredSkills: ['Sapphire is the highest Xcel division — outside beta scope'], executionStandards: [], srRequirements: [], scoreThreshold: null, commonGaps: ['No higher Xcel level exists. Consider JO Level 9/10 track.'] },
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
