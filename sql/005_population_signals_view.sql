-- Migration 005: population_signals view (anonymized research export layer).
-- Depends on: 003_biomechanical_profiles.sql, 002_athlete_research_columns.sql.
--
-- This view exposes ZERO PII. Verification:
--   - No athlete name, email, date of birth, or raw athlete_id
--   - anon_athlete_hash is a one-way SHA256 — not reversible
--   - age_bracket is bucketed (never exact age)
--   - region_code is state-level only (never city or zip)
--
-- WHERE clause enforces: only athletes who have research_consent = TRUE
-- are included. Default is FALSE, so no data exports until explicit consent.
--
-- Access: SELECT granted to service_role only. No public or anon access.

CREATE OR REPLACE VIEW population_signals AS
SELECT
  bp.anon_athlete_hash,
  bp.age_bracket,
  bp.region_code,
  bp.event,
  bp.level,
  bp.program_type,
  COUNT(*)                                              AS analysis_count,
  SUM(CASE WHEN bp.hyperextension THEN 1 ELSE 0 END)   AS hyperextension_count,
  SUM(CASE WHEN bp.hard_landing THEN 1 ELSE 0 END)     AS hard_landing_count,
  SUM(CASE WHEN bp.knee_valgus THEN 1 ELSE 0 END)      AS knee_valgus_count,
  SUM(CASE WHEN bp.back_arch THEN 1 ELSE 0 END)        AS back_arch_count,
  AVG(bp.fall_count)                                    AS avg_fall_count,
  AVG(bp.shoulder_asymmetry_deg)                        AS avg_shoulder_asym,
  AVG(bp.knee_flexion_at_landing)                       AS avg_knee_flexion,
  MIN(bp.captured_at)                                   AS first_analysis,
  MAX(bp.captured_at)                                   AS last_analysis
FROM biomechanical_profiles bp
JOIN athletes a ON a.id = bp.athlete_id
WHERE a.research_consent = TRUE
GROUP BY
  bp.anon_athlete_hash,
  bp.age_bracket,
  bp.region_code,
  bp.event,
  bp.level,
  bp.program_type;

-- Access control: service_role only
GRANT SELECT ON population_signals TO service_role;
REVOKE ALL ON population_signals FROM anon, authenticated;
