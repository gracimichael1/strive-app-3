-- Migration 002: Add research + anonymization columns to athletes table.
-- Depends on: Phase 3-A foundational migration (athletes table exists).
-- Run AFTER 001_biomechanical_signals.sql.
--
-- movement_profile_hash: SHA256(athlete.id + STRIVE_ANON_SALT env var).
-- Computed at first analysis save. Never expose athlete.id in research exports.
--
-- research_consent: default FALSE. No athlete is opted into research data
-- export until explicitly consented via future Phase 3-D UI.

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS movement_profile_hash TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS program_type          TEXT DEFAULT 'WAG';  -- 'WAG' | 'MAG'
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS research_consent      BOOLEAN DEFAULT FALSE;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS research_consent_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_athletes_movement_hash ON athletes (movement_profile_hash);
CREATE INDEX IF NOT EXISTS idx_athletes_program_type  ON athletes (program_type);
