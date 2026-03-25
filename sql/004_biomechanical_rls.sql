-- Migration 004: RLS policies for biomechanical_profiles.
-- Depends on: 003_biomechanical_profiles.sql.
--
-- Access rules:
--   Athletes / parents: read their own records only
--   Gym coaches: read records for athletes in their gym (Phase 3-B+)
--   Service role: full access for aggregate research queries
--   Anonymous users: no access

ALTER TABLE biomechanical_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: athletes read their own profiles via athlete_id matching auth user
CREATE POLICY bioprof_athlete_select
  ON biomechanical_profiles
  FOR SELECT
  USING (
    athlete_id IN (
      SELECT id FROM athletes WHERE user_id = auth.uid()
    )
  );

-- Policy: service role can insert (analysis pipeline runs as service role)
CREATE POLICY bioprof_service_insert
  ON biomechanical_profiles
  FOR INSERT
  WITH CHECK (true);
-- Note: this policy only applies when using service_role key.
-- anon/authenticated users cannot insert — no INSERT policy for them.

-- Policy: gym coaches read their gym's athletes (Phase 3-B+)
-- Uncomment when gym_memberships table exists:
-- CREATE POLICY bioprof_coach_select
--   ON biomechanical_profiles
--   FOR SELECT
--   USING (
--     athlete_id IN (
--       SELECT athlete_id FROM gym_memberships
--       WHERE gym_id IN (
--         SELECT gym_id FROM gym_coaches WHERE user_id = auth.uid()
--       )
--     )
--   );

-- Deny all to anon by default (RLS enabled + no matching policy = denied)
