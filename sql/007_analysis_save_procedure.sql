-- Migration 007: Stored procedure for writing biomechanical profile on analysis save.
-- Depends on: 003_biomechanical_profiles.sql, 002_athlete_research_columns.sql.
--
-- Called fire-and-forget from the analysis save pipeline after writing to analyses.
-- On any error: logs to pg_notify, does not block the analysis return.
--
-- The application-side call looks like:
--   supabase.rpc('save_biomechanical_profile', { ... }).then(() => {}).catch(console.error)
-- (fire-and-forget — no await)

CREATE OR REPLACE FUNCTION save_biomechanical_profile(
  p_athlete_id              UUID,
  p_analysis_id             UUID,
  p_hyperextension          BOOLEAN DEFAULT NULL,
  p_hard_landing            BOOLEAN DEFAULT NULL,
  p_asymmetry_side          TEXT DEFAULT NULL,
  p_fall_count              INTEGER DEFAULT NULL,
  p_knee_valgus             BOOLEAN DEFAULT NULL,
  p_back_arch               BOOLEAN DEFAULT NULL,
  p_shoulder_asymmetry_deg  NUMERIC DEFAULT NULL,
  p_hip_drop_detected       BOOLEAN DEFAULT NULL,
  p_knee_flexion_at_landing NUMERIC DEFAULT NULL,
  p_spine_angle_peak        NUMERIC DEFAULT NULL,
  p_event                   TEXT DEFAULT NULL,
  p_level                   TEXT DEFAULT NULL,
  p_program_type            TEXT DEFAULT 'WAG',
  p_age_bracket             TEXT DEFAULT NULL,
  p_region_code             TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_anon_hash TEXT;
  v_profile_id UUID;
BEGIN
  -- Compute or retrieve anonymization hash
  SELECT movement_profile_hash INTO v_anon_hash
  FROM athletes WHERE id = p_athlete_id;

  IF v_anon_hash IS NULL THEN
    v_anon_hash := encode(
      digest(p_athlete_id::text || coalesce(current_setting('app.strive_anon_salt', true), 'strive-default-salt'), 'sha256'),
      'hex'
    );
    UPDATE athletes SET movement_profile_hash = v_anon_hash WHERE id = p_athlete_id;
  END IF;

  INSERT INTO biomechanical_profiles (
    athlete_id, analysis_id, captured_at,
    hyperextension, hard_landing, asymmetry_side, fall_count, knee_valgus, back_arch,
    shoulder_asymmetry_deg, hip_drop_detected, knee_flexion_at_landing, spine_angle_peak,
    event, level, program_type,
    anon_athlete_hash, age_bracket, region_code
  ) VALUES (
    p_athlete_id, p_analysis_id, now(),
    p_hyperextension, p_hard_landing, p_asymmetry_side, p_fall_count, p_knee_valgus, p_back_arch,
    p_shoulder_asymmetry_deg, p_hip_drop_detected, p_knee_flexion_at_landing, p_spine_angle_peak,
    p_event, p_level, p_program_type,
    v_anon_hash, p_age_bracket, p_region_code
  )
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;

EXCEPTION WHEN OTHERS THEN
  -- Log error but never block the caller
  RAISE WARNING 'save_biomechanical_profile failed for analysis %: %', p_analysis_id, SQLERRM;
  RETURN NULL;
END;
$$;
