-- Migration: Add biomechanical signal columns to analyses table.
-- Run this AFTER Supabase is wired (Phase 3-A).
-- All columns nullable. No default non-null. Additive-only.
--
-- These columns are populated by parsing Gemini BHPA text output
-- at analysis save time. Null means the signal was not detected
-- or could not be parsed from the text.

ALTER TABLE analyses ADD COLUMN IF NOT EXISTS hyperextension    BOOLEAN   DEFAULT NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS hard_landing      BOOLEAN   DEFAULT NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS asymmetry_side    TEXT      DEFAULT NULL;  -- 'left' | 'right' | null
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS fall_count        INTEGER   DEFAULT NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS knee_valgus       BOOLEAN   DEFAULT NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS back_arch         BOOLEAN   DEFAULT NULL;
