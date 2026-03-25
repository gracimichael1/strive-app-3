# STRIVE SQL Migrations

Run these **in order** after Phase 3-A foundational tables (`users`, `athletes`, `analyses`) exist in Supabase.

## Prerequisites
- Supabase project created and connected
- `@supabase/supabase-js` installed
- `STRIVE_ANON_SALT` environment variable set (for anonymization hashing)
- Foundational tables exist: `users`, `athletes`, `analyses`
- `pgcrypto` extension enabled (`CREATE EXTENSION IF NOT EXISTS pgcrypto;`)

## Migration Order

| File | Description | Depends On |
|------|-------------|------------|
| `001_biomechanical_signals.sql` | Add 6 signal columns to `analyses` | `analyses` table |
| `002_athlete_research_columns.sql` | Add `movement_profile_hash`, `program_type`, `research_consent` to `athletes` | `athletes` table |
| `003_biomechanical_profiles.sql` | Create `biomechanical_profiles` table + indexes | `athletes`, `analyses` |
| `004_biomechanical_rls.sql` | RLS policies for `biomechanical_profiles` | 003 |
| `005_population_signals_view.sql` | Anonymized `population_signals` research view | 003, 002 |
| `006_backfill_biomechanical.sql` | One-time backfill function | 003, 001 |
| `007_analysis_save_procedure.sql` | `save_biomechanical_profile()` stored procedure | 003, 002 |

## Running

```sql
-- Run each file in order via Supabase SQL Editor or psql:
\i sql/001_biomechanical_signals.sql
\i sql/002_athlete_research_columns.sql
\i sql/003_biomechanical_profiles.sql
\i sql/004_biomechanical_rls.sql
\i sql/005_population_signals_view.sql
\i sql/006_backfill_biomechanical.sql
\i sql/007_analysis_save_procedure.sql

-- Then run the backfill:
SELECT * FROM backfill_biomechanical_profiles();

-- Verify:
SELECT COUNT(*) FROM biomechanical_profiles;
SELECT * FROM population_signals LIMIT 5;
```

## PII Verification
The `population_signals` view contains **zero PII**:
- `anon_athlete_hash` — one-way SHA256, not reversible
- `age_bracket` — bucketed, never exact age
- `region_code` — state abbreviation only, never city/zip
- No athlete name, email, date of birth, or raw ID
- Only rows where `research_consent = TRUE` are included
