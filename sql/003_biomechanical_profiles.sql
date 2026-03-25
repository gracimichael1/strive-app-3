-- Migration 003: Create biomechanical_profiles table.
-- Depends on: Phase 3-A foundational migrations (athletes, analyses tables exist).
-- Depends on: 002_athlete_research_columns.sql.
--
-- One row per analysis. Stores extracted biomechanical signals for
-- longitudinal tracking and anonymized population research.

CREATE TABLE IF NOT EXISTS biomechanical_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id              UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  analysis_id             UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  captured_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Core pose signals (per-analysis aggregate, parsed from Gemini BHPA text)
  hyperextension          BOOLEAN,
  hard_landing            BOOLEAN,
  asymmetry_side          TEXT,             -- 'left' | 'right' | null
  fall_count              INTEGER,
  knee_valgus             BOOLEAN,
  back_arch               BOOLEAN,

  -- Expanded joint signals (populated when MediaPipe data available)
  shoulder_asymmetry_deg  NUMERIC(5,2),     -- degrees left-right delta
  hip_drop_detected       BOOLEAN,
  knee_flexion_at_landing NUMERIC(5,2),     -- degrees
  spine_angle_peak        NUMERIC(5,2),     -- degrees from vertical

  -- Event and level context (for population queries)
  event                   TEXT,             -- 'floor' | 'beam' | 'bars' | 'vault'
  level                   TEXT,             -- 'xcel_gold' | 'level_5' etc.
  program_type            TEXT,             -- 'WAG' | 'MAG'

  -- Anonymization (for research export — never expose athlete_id)
  anon_athlete_hash       TEXT,             -- SHA256(athlete_id + salt)
  age_bracket             TEXT,             -- '8-10' | '11-13' | '14-16' | '17+'
  region_code             TEXT              -- state abbreviation only, never city
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bioprof_athlete    ON biomechanical_profiles (athlete_id);
CREATE INDEX IF NOT EXISTS idx_bioprof_event_lvl  ON biomechanical_profiles (event, level);
CREATE INDEX IF NOT EXISTS idx_bioprof_anon_hash  ON biomechanical_profiles (anon_athlete_hash);
CREATE INDEX IF NOT EXISTS idx_bioprof_captured   ON biomechanical_profiles (captured_at);
CREATE INDEX IF NOT EXISTS idx_bioprof_analysis   ON biomechanical_profiles (analysis_id);
