-- Migration 006: One-time backfill function for biomechanical_profiles.
-- Depends on: 003_biomechanical_profiles.sql, 001_biomechanical_signals.sql.
--
-- Reads all existing analyses records, extracts biomechanical signals from
-- the columns added in 001, and inserts a row into biomechanical_profiles
-- for each analysis where athlete_id is not null.
--
-- Processes in batches of 100 to avoid timeout.
-- Idempotent: skips analyses that already have a biomechanical_profiles row.
--
-- Usage: SELECT backfill_biomechanical_profiles();
-- After running: SELECT COUNT(*) FROM biomechanical_profiles; to verify.

CREATE OR REPLACE FUNCTION backfill_biomechanical_profiles()
RETURNS TABLE(total_processed INTEGER, total_inserted INTEGER, total_skipped INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  batch_size   INTEGER := 100;
  offset_val   INTEGER := 0;
  batch_count  INTEGER;
  v_processed  INTEGER := 0;
  v_inserted   INTEGER := 0;
  v_skipped    INTEGER := 0;
  rec          RECORD;
  v_anon_hash  TEXT;
  v_age_bracket TEXT;
BEGIN
  LOOP
    batch_count := 0;

    FOR rec IN
      SELECT
        a.id         AS analysis_id,
        a.athlete_id,
        a.created_at,
        a.hyperextension,
        a.hard_landing,
        a.asymmetry_side,
        a.fall_count,
        a.knee_valgus,
        a.back_arch,
        a.event,
        a.level,
        ath.program_type,
        ath.movement_profile_hash,
        ath.date_of_birth,
        ath.region
      FROM analyses a
      JOIN athletes ath ON ath.id = a.athlete_id
      WHERE a.athlete_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM biomechanical_profiles bp WHERE bp.analysis_id = a.id
        )
      ORDER BY a.created_at
      LIMIT batch_size
      OFFSET offset_val
    LOOP
      batch_count := batch_count + 1;
      v_processed := v_processed + 1;

      -- Compute anonymization hash
      v_anon_hash := rec.movement_profile_hash;
      IF v_anon_hash IS NULL THEN
        v_anon_hash := encode(
          digest(rec.athlete_id::text || coalesce(current_setting('app.strive_anon_salt', true), 'strive-default-salt'), 'sha256'),
          'hex'
        );
        -- Backfill the athlete's movement_profile_hash while we're here
        UPDATE athletes SET movement_profile_hash = v_anon_hash WHERE id = rec.athlete_id AND movement_profile_hash IS NULL;
      END IF;

      -- Compute age bracket from date_of_birth
      v_age_bracket := CASE
        WHEN rec.date_of_birth IS NULL THEN NULL
        WHEN EXTRACT(YEAR FROM age(rec.date_of_birth)) BETWEEN 0 AND 10 THEN '8-10'
        WHEN EXTRACT(YEAR FROM age(rec.date_of_birth)) BETWEEN 11 AND 13 THEN '11-13'
        WHEN EXTRACT(YEAR FROM age(rec.date_of_birth)) BETWEEN 14 AND 16 THEN '14-16'
        ELSE '17+'
      END;

      -- Insert biomechanical profile row
      INSERT INTO biomechanical_profiles (
        athlete_id, analysis_id, captured_at,
        hyperextension, hard_landing, asymmetry_side, fall_count, knee_valgus, back_arch,
        event, level, program_type,
        anon_athlete_hash, age_bracket, region_code
      ) VALUES (
        rec.athlete_id, rec.analysis_id, coalesce(rec.created_at, now()),
        rec.hyperextension, rec.hard_landing, rec.asymmetry_side, rec.fall_count, rec.knee_valgus, rec.back_arch,
        rec.event, rec.level, coalesce(rec.program_type, 'WAG'),
        v_anon_hash, v_age_bracket, rec.region
      );

      v_inserted := v_inserted + 1;
    END LOOP;

    -- Exit when no more rows to process
    EXIT WHEN batch_count = 0;

    -- Move offset forward for next batch
    offset_val := offset_val + batch_size;

    -- Log progress
    RAISE NOTICE 'Backfill progress: % processed, % inserted', v_processed, v_inserted;
  END LOOP;

  v_skipped := v_processed - v_inserted;

  RAISE NOTICE 'Backfill complete. Processed: %, Inserted: %, Skipped: %', v_processed, v_inserted, v_skipped;

  RETURN QUERY SELECT v_processed, v_inserted, v_skipped;
END;
$$;

-- To run: SELECT * FROM backfill_biomechanical_profiles();
-- To verify: SELECT COUNT(*) FROM biomechanical_profiles;
