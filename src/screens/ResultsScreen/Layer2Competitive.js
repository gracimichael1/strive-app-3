import React, { useState } from 'react';
import ScoreHero from './ScoreHero';
import SkillCard from '../../components/ui/SkillCard';
import VideoReviewPlayer from '../../components/video/VideoReviewPlayer';
import { safeStr, safeArray, safeNum } from '../../utils/helpers';
import RoadToNextLevel from './RoadToNextLevel';

const COLORS = {
  surface: '#0d1422',
  surface2: '#121b2d',
  surface3: '#1a2540',
  gold: '#e8962a',
  goldLight: '#ffc15a',
  green: '#22c55e',
  orange: '#e06820',
  red: '#dc2626',
  text: '#E2E8F0',
  textSecondary: '#8890AB',
  textMuted: '#8A90AA',
  border: 'rgba(232, 150, 42, 0.12)',
};

// Grade colors for stats bar
const GRADE_COLOR = {
  'A+': '#22c55e', 'A': '#22c55e', 'A-': '#4ade80',
  'B+': '#4ade80', 'B': '#ffc15a', 'B-': '#ffc15a',
  'C+': '#e06820', 'C': '#e06820', 'C-': '#dc2626',
  'D+': '#dc2626', 'D': '#dc2626', 'F': '#8b72d4',
};
const GRADE_RANK = { 'A+': 12, 'A': 11, 'A-': 10, 'B+': 9, 'B': 8, 'B-': 7, 'C+': 6, 'C': 5, 'C-': 4, 'D+': 3, 'D': 2, 'F': 1 };

function Layer2Competitive({ result, profile, previousResult, onSeek, videoUrl }) {
  const gradedSkills = safeArray(result?.gradedSkills);
  const deductions = safeArray(result?.executionDeductions);
  const finalScore = safeNum(result?.finalScore, 0);
  const [skillFilter, setSkillFilter] = useState('all');

  // New summary data — check both result.summary (JSON direct) and top-level fields (parsed)
  const summary = result?.summary || null;
  const whyThisScore = safeStr(summary?.whyThisScore || result?.whyThisScore, '');
  const celebrations = safeArray(summary?.celebrations || result?.celebrations);
  const topImprovements = safeArray(summary?.topImprovements || result?.topImprovements);

  // Artistry & Composition
  const artistry = result?.artistry || null;
  const composition = result?.composition || null;

  // Collapsible states
  const [artistryOpen, setArtistryOpen] = useState(false);

  // Score Path: top 2 deductions to fix
  const sortedDeds = [...deductions].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0));
  const topFixes = sortedDeds.slice(0, 2);
  const totalFixGain = topFixes.reduce((s, d) => s + safeNum(d.deduction, 0), 0);
  const projectedScore = Math.min(10, finalScore + totalFixGain);
  const targetScore = Math.ceil(projectedScore * 10) / 10;
  const drillCount = Math.max(2, topFixes.length + 1);

  // Weekly focus drills — derive from top faults
  const topDrills = sortedDeds.slice(0, 3).map((d, i) => {
    const drillText = safeStr(d.drill || d.fix || d.correction, `Focus drill for ${safeStr(d.fault, 'this area')}`);
    return { number: i + 1, text: drillText };
  });

  // Calculate projected score from topImprovements
  const improvementGain = topImprovements.reduce((s, imp) => s + safeNum(imp?.pointsGained, 0), 0);
  const improvedProjected = Math.min(10, finalScore + improvementGain);

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '0 0 90px',
        maxWidth: 540,
        margin: '0 auto',
      }}
      role="main"
      aria-label="Competitive tier analysis results"
    >
      <ScoreHero
        result={result}
        profile={profile}
        previousResult={previousResult}
        tier="competitive"
      />

      {/* Video Review Player — slow-mo, seek-to-skill, skeleton overlay */}
      <VideoReviewPlayer videoUrl={videoUrl} result={result} />

      {/* Score Path */}
      {topFixes.length > 0 && finalScore < 9.8 && (
        <div
          style={{
            margin: '20px 20px 0',
            background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.03))',
            border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: 16,
            padding: 20,
            textAlign: 'center',
          }}
          role="region"
          aria-label="Score improvement path"
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.green,
              marginBottom: 12,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            Your path to {targetScore.toFixed(1)}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              margin: '16px 0',
            }}
          >
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 24,
                fontWeight: 700,
                color: COLORS.gold,
              }}
            >
              {finalScore.toFixed(3)}
            </div>
            <div style={{ color: COLORS.textMuted, fontSize: 20 }}>&#10230;</div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 24,
                fontWeight: 700,
                color: COLORS.green,
              }}
            >
              {projectedScore.toFixed(3)}
            </div>
          </div>

          <div
            style={{
              fontSize: 12,
              color: COLORS.textSecondary,
              lineHeight: 1.6,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            Fix {topFixes.map((d, i) => {
              const name = safeStr(d.fault || d.skill, 'this fault');
              const gain = safeNum(d.deduction, 0);
              return `${name} (+${gain.toFixed(2)})`;
            }).join(' and ')} to gain {totalFixGain.toFixed(2)}.
            <br />
            That's {drillCount} focused drills away.
          </div>
        </div>
      )}

      {/* Judge's Analysis */}
      {whyThisScore && (
        <div
          style={{
            margin: '20px 20px 0',
            background: COLORS.surface,
            border: `1px solid rgba(232, 150, 42, 0.2)`,
            borderRadius: 16,
            padding: 20,
          }}
          role="region"
          aria-label="Judge's analysis"
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: COLORS.gold,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 10,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            Judge's Analysis
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: COLORS.text,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            {whyThisScore}
          </div>
        </div>
      )}

      {/* Celebrations — What Went Right */}
      {celebrations.length > 0 && (
        <div
          style={{
            margin: '12px 20px 0',
            background: COLORS.surface,
            border: `1px solid rgba(34, 197, 94, 0.15)`,
            borderRadius: 16,
            padding: 20,
          }}
          role="region"
          aria-label="What went right"
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: COLORS.green,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 12,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            What Went Right
          </div>
          {celebrations.map((c, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '6px 0',
              }}
            >
              <span style={{ color: COLORS.green, fontSize: 14, flexShrink: 0, lineHeight: 1.4 }} aria-hidden="true">&#10003;</span>
              <span style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Outfit', sans-serif", lineHeight: 1.5 }}>
                {safeStr(c, '')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Path to a Higher Score */}
      {topImprovements.length > 0 && (
        <div
          style={{
            margin: '12px 20px 0',
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: 20,
          }}
          role="region"
          aria-label="Path to a higher score"
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: COLORS.gold,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 12,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            Path to a Higher Score
          </div>
          {topImprovements.map((imp, i) => {
            const fix = safeStr(imp?.fix, '');
            const pts = safeNum(imp?.pointsGained, 0);
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: i < topImprovements.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                }}
              >
                <span style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Outfit', sans-serif", lineHeight: 1.5, flex: 1 }}>
                  {fix}
                </span>
                {pts > 0 && (
                  <span
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 13,
                      fontWeight: 700,
                      color: COLORS.green,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    +{pts.toFixed(2)}
                  </span>
                )}
              </div>
            );
          })}
          {improvementGain > 0 && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid rgba(255,255,255,0.05)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: "'Outfit', sans-serif" }}>
                Projected Score
              </div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: COLORS.green }}>
                {improvedProjected.toFixed(3)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Road to the Next Level */}
      <RoadToNextLevel profile={profile} result={result} />

      {/* Artistry & Composition Breakdown */}
      {(artistry || composition) && (
        <div
          style={{
            margin: '12px 20px 0',
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            overflow: 'hidden',
          }}
          role="region"
          aria-label="Artistry and composition breakdown"
        >
          <button
            onClick={() => setArtistryOpen(!artistryOpen)}
            aria-expanded={artistryOpen}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 20,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: COLORS.text,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>
              Artistry & Composition
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {artistry?.totalDeduction != null && (
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: COLORS.orange }}>
                  -{safeNum(artistry.totalDeduction, 0).toFixed(2)}
                </span>
              )}
              {composition?.totalDeduction != null && (
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: COLORS.orange }}>
                  -{safeNum(composition.totalDeduction, 0).toFixed(2)}
                </span>
              )}
              <svg
                width="12" height="12" viewBox="0 0 14 14"
                fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"
                style={{ transform: artistryOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                aria-hidden="true"
              >
                <path d="M2 5l5 4 5-4" />
              </svg>
            </div>
          </button>

          {artistryOpen && (
            <div style={{ padding: '0 20px 20px' }}>
              {/* Artistry */}
              {artistry && safeArray(artistry.details).length > 0 && (
                <div style={{ marginBottom: composition ? 16 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, fontFamily: "'Outfit', sans-serif" }}>
                    Artistry
                  </div>
                  {safeArray(artistry.details).map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < safeArray(artistry.details).length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                      <span style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>{safeStr(d?.fault, '')}</span>
                      {d?.deduction != null && (
                        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: COLORS.orange, fontWeight: 700 }}>
                          -{safeNum(d.deduction, 0).toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                  {artistry.totalDeduction != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>Total</span>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: COLORS.orange, fontWeight: 700 }}>-{safeNum(artistry.totalDeduction, 0).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Composition */}
              {composition && safeArray(composition.details).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, fontFamily: "'Outfit', sans-serif" }}>
                    Composition
                  </div>
                  {safeArray(composition.details).map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < safeArray(composition.details).length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                      <span style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>{safeStr(d?.fault, '')}</span>
                      {d?.deduction != null && (
                        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: COLORS.orange, fontWeight: 700 }}>
                          -{safeNum(d.deduction, 0).toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                  {composition.totalDeduction != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>Total</span>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: COLORS.orange, fontWeight: 700 }}>-{safeNum(composition.totalDeduction, 0).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Stats Summary Bar ── */}
      {gradedSkills.length > 0 && (() => {
        const cleanCount = gradedSkills.filter(s => (!s.fault && !s.subFaults?.length && !s.faults?.length) || (typeof s.deduction === 'number' ? s.deduction : s.gradeDeduction || 0) === 0).length;
        const faultCount = gradedSkills.length - cleanCount;
        const bestGrade = gradedSkills.reduce((best, s) => (GRADE_RANK[s.grade] || 0) > (GRADE_RANK[best] || 0) ? s.grade : best, 'F');
        const stats = [
          { label: 'Skills', val: gradedSkills.length, color: COLORS.gold, bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)' },
          { label: 'Clean', val: cleanCount, color: COLORS.green, bg: 'rgba(34,197,94,0.05)', border: 'rgba(34,197,94,0.2)' },
          { label: 'Faults', val: faultCount, color: COLORS.red, bg: 'rgba(220,38,38,0.05)', border: 'rgba(220,38,38,0.2)' },
          { label: 'Best', val: bestGrade, color: GRADE_COLOR[bestGrade] || COLORS.gold, bg: 'rgba(232,150,42,0.05)', border: 'rgba(232,150,42,0.15)' },
        ];
        return (
          <div style={{ display: 'flex', gap: 8, margin: '20px 20px 0' }}>
            {stats.map(s => (
              <div key={s.label} style={{ flex: 1, padding: '12px 6px', background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: "'Space Mono', monospace" }}>{s.val}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: "'Outfit', sans-serif" }}>{s.label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Filter Pills ── */}
      {gradedSkills.length > 0 && (
        <div style={{ display: 'flex', gap: 6, margin: '16px 20px 0', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'acro', label: 'Acro' },
            { id: 'dance', label: 'Dance' },
            { id: 'clean', label: 'Clean' },
            { id: 'faults', label: 'Faults' },
          ].map(pill => (
            <button key={pill.id} onClick={() => setSkillFilter(pill.id)}
              style={{
                padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                fontFamily: "'Outfit', sans-serif", cursor: 'pointer', whiteSpace: 'nowrap',
                minHeight: 32, transition: 'all 0.2s',
                background: skillFilter === pill.id ? COLORS.gold : 'transparent',
                color: skillFilter === pill.id ? '#070c16' : 'rgba(255,255,255,0.5)',
                border: skillFilter === pill.id ? `1px solid ${COLORS.gold}` : '1px solid rgba(255,255,255,0.1)',
              }}>
              {pill.label}
            </button>
          ))}
        </div>
      )}

      {/* Skills section header */}
      <div
        style={{
          padding: '20px 20px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.3)',
            fontFamily: "'Outfit', sans-serif",
            margin: 0,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Skill-by-Skill Breakdown
        </h2>
        {skillFilter !== 'all' && (
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 12,
              color: COLORS.textMuted,
              background: COLORS.surface2,
              padding: '4px 10px',
              borderRadius: 10,
            }}
          >
            {(() => {
              const filtered = skillFilter === 'acro' ? gradedSkills.filter(s => (s.type || '').toLowerCase() === 'acro')
                : skillFilter === 'dance' ? gradedSkills.filter(s => (s.type || '').toLowerCase() === 'dance')
                : skillFilter === 'clean' ? gradedSkills.filter(s => (!s.fault && !s.subFaults?.length && !s.faults?.length) || (typeof s.deduction === 'number' ? s.deduction : s.gradeDeduction || 0) === 0)
                : skillFilter === 'faults' ? gradedSkills.filter(s => (s.fault || s.subFaults?.length || s.faults?.length) && (typeof s.deduction === 'number' ? s.deduction : s.gradeDeduction || 0) > 0)
                : gradedSkills;
              return `${filtered.length} shown`;
            })()}
          </span>
        )}
      </div>

      {/* Skill cards (filtered) */}
      {(() => {
        const filtered = skillFilter === 'all' ? gradedSkills
          : skillFilter === 'acro' ? gradedSkills.filter(s => (s.type || '').toLowerCase() === 'acro')
          : skillFilter === 'dance' ? gradedSkills.filter(s => (s.type || '').toLowerCase() === 'dance')
          : skillFilter === 'clean' ? gradedSkills.filter(s => (!s.fault && !s.subFaults?.length && !s.faults?.length) || (typeof s.deduction === 'number' ? s.deduction : s.gradeDeduction || 0) === 0)
          : skillFilter === 'faults' ? gradedSkills.filter(s => (s.fault || s.subFaults?.length || s.faults?.length) && (typeof s.deduction === 'number' ? s.deduction : s.gradeDeduction || 0) > 0)
          : gradedSkills;
        return filtered.length === 0 ? (
          <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
            No {skillFilter} skills found in this routine.
          </div>
        ) : filtered.map((skill, i) => (
          <SkillCard key={i} skill={skill} index={i + 1} onSeek={onSeek} />
        ));
      })()}

      {/* Weekly Focus Drills */}
      {topDrills.length > 0 && (
        <div
          style={{
            margin: '20px 20px 12px',
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: 20,
          }}
          role="region"
          aria-label="This week's focus drills"
        >
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: COLORS.text,
              fontFamily: "'Outfit', sans-serif",
              margin: '0 0 12px 0',
            }}
          >
            This Week's Focus Drills
          </h3>
          {topDrills.map((drill) => (
            <div
              key={drill.number}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: drill.number < topDrills.length ? '1px solid rgba(255,255,255,0.03)' : 'none',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: COLORS.surface3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  color: COLORS.gold,
                  flexShrink: 0,
                }}
              >
                {drill.number}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: COLORS.textSecondary,
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                {drill.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(Layer2Competitive);
