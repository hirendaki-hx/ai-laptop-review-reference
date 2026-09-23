-- ==============================================================================
-- AI LAPTOP REVIEW PLATFORM V2 - FINAL SCHEMA UPGRADE MIGRATION CONTRACT
-- Migration: 20260922000002_v2_schema_contract.sql
-- Upgrades existing database schema to complete V2 contract without data loss.
-- Safe, idempotent, non-destructive.
-- ==============================================================================

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. UPGRADE laptops TABLE (Add missing created_at)
-- ==============================================================================
ALTER TABLE laptops 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_laptops_created_at ON laptops(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_laptops_brand_id ON laptops(brand_id);

-- ==============================================================================
-- 3. UPGRADE extraction_jobs TABLE (Add missing V2 job tracking columns)
-- ==============================================================================
ALTER TABLE extraction_jobs 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE extraction_jobs 
ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE extraction_jobs 
ADD COLUMN IF NOT EXISTS last_started_at TIMESTAMPTZ NULL;

ALTER TABLE extraction_jobs 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;

ALTER TABLE extraction_jobs 
ADD COLUMN IF NOT EXISTS model_used TEXT NULL;

ALTER TABLE extraction_jobs 
ADD COLUMN IF NOT EXISTS processing_duration_ms INTEGER NULL;

-- Safe check constraints for extraction_jobs
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_extraction_jobs_attempt_count'
    ) THEN
        ALTER TABLE extraction_jobs ADD CONSTRAINT chk_extraction_jobs_attempt_count CHECK (attempt_count >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_extraction_jobs_processing_duration'
    ) THEN
        ALTER TABLE extraction_jobs ADD CONSTRAINT chk_extraction_jobs_processing_duration CHECK (processing_duration_ms IS NULL OR processing_duration_ms >= 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status ON extraction_jobs(status);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_updated_at ON extraction_jobs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_last_started ON extraction_jobs(last_started_at);

-- ==============================================================================
-- 4. extraction_jobs updated_at TRIGGER MAINTENANCE
-- ==============================================================================
CREATE OR REPLACE FUNCTION set_extraction_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_extraction_jobs_updated_at ON extraction_jobs;
CREATE TRIGGER trigger_set_extraction_jobs_updated_at
    BEFORE UPDATE ON extraction_jobs
    FOR EACH ROW
    EXECUTE FUNCTION set_extraction_jobs_updated_at();

-- ==============================================================================
-- 5. CREATE evidence_records TABLE (Supports source attribution and video timestamps)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS evidence_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_source_id UUID NOT NULL REFERENCES review_sources(id) ON DELETE CASCADE,
    field_path TEXT NOT NULL,
    timestamp_seconds INTEGER CHECK (timestamp_seconds IS NULL OR timestamp_seconds >= 0),
    timestamp_display TEXT,
    evidence_description TEXT NOT NULL,
    evidence_text TEXT,
    confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_records_review_source_id ON evidence_records(review_source_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_field_path ON evidence_records(field_path);

-- Enable RLS and public read policy on evidence_records
ALTER TABLE evidence_records ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Public can view evidence records" ON evidence_records;
    CREATE POLICY "Public can view evidence records" ON evidence_records FOR SELECT USING (true);
END $$;

-- ==============================================================================
-- 6. ATOMIC COMMIT RPC FUNCTION V2: commit_reviewed_extraction_v2
-- Signature and parameter contract matches src/server/repositories/commitRepository.ts exactly.
-- ==============================================================================
CREATE OR REPLACE FUNCTION commit_reviewed_extraction_v2(
    p_job_id UUID,
    p_brand_name TEXT,
    p_laptop_model TEXT,
    p_laptop_series TEXT,
    p_laptop_generation TEXT,
    p_config_json JSONB,
    p_review_json JSONB,
    p_benchmarks_json JSONB,
    p_gaming_json JSONB,
    p_thermals_json JSONB,
    p_display_json JSONB,
    p_battery_json JSONB,
    p_evidence_json JSONB,
    p_use_existing_config_id UUID DEFAULT NULL,
    p_reviewer_identity TEXT DEFAULT 'admin_reviewer'
) RETURNS JSONB AS $$
DECLARE
    v_brand_id UUID;
    v_laptop_id UUID;
    v_config_id UUID;
    v_review_id UUID;
    v_job_status TEXT;
    v_job_video_id TEXT;
    v_review_video_id TEXT;
    v_audit_id UUID;
BEGIN
    -- 1. Validate & Lock Job Row
    SELECT status, youtube_video_id INTO v_job_status, v_job_video_id
    FROM extraction_jobs 
    WHERE id = p_job_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Job % not found in database', p_job_id;
    END IF;

    -- Idempotency check: if job was already marked completed, return existing review details
    IF v_job_status = 'completed' THEN
        SELECT id, configuration_id INTO v_review_id, v_config_id 
        FROM review_sources 
        WHERE youtube_video_id = v_job_video_id 
        LIMIT 1;
        
        IF FOUND THEN
            RETURN jsonb_build_object(
                'status', 'idempotent_success',
                'review_source_id', v_review_id,
                'configuration_id', v_config_id,
                'message', 'Job was already previously committed'
            );
        END IF;
    END IF;

    -- Verify video ID integrity
    v_review_video_id := p_review_json->>'youtube_video_id';
    IF v_review_video_id IS NULL OR v_review_video_id != v_job_video_id THEN
        RAISE EXCEPTION 'YouTube video ID mismatch between extraction job (%) and review payload (%)', v_job_video_id, v_review_video_id;
    END IF;

    -- Prevent duplicate review creation for the same YouTube video
    SELECT id, configuration_id INTO v_review_id, v_config_id 
    FROM review_sources 
    WHERE youtube_video_id = v_review_video_id 
    LIMIT 1;

    IF FOUND THEN
        -- Mark extraction job completed and point to existing review
        UPDATE extraction_jobs 
        SET status = 'completed',
            review_source_id = v_review_id,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_job_id;

        RETURN jsonb_build_object(
            'status', 'idempotent_success',
            'review_source_id', v_review_id,
            'configuration_id', v_config_id,
            'message', 'Review for this YouTube video already exists in database'
        );
    END IF;

    -- 2. Upsert Laptop Brand
    SELECT id INTO v_brand_id 
    FROM laptop_brands 
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(p_brand_name));

    IF NOT FOUND THEN
        INSERT INTO laptop_brands (name) 
        VALUES (TRIM(p_brand_name)) 
        RETURNING id INTO v_brand_id;
    END IF;

    -- 3. Upsert Laptop
    SELECT id INTO v_laptop_id 
    FROM laptops 
    WHERE brand_id = v_brand_id 
      AND LOWER(TRIM(model)) = LOWER(TRIM(p_laptop_model))
      AND COALESCE(LOWER(TRIM(series)), '') = COALESCE(LOWER(TRIM(p_laptop_series)), '')
      AND COALESCE(LOWER(TRIM(generation)), '') = COALESCE(LOWER(TRIM(p_laptop_generation)), '');

    IF NOT FOUND THEN
        INSERT INTO laptops (brand_id, model, series, generation, created_at) 
        VALUES (
            v_brand_id, 
            TRIM(p_laptop_model), 
            NULLIF(TRIM(p_laptop_series), ''), 
            NULLIF(TRIM(p_laptop_generation), ''),
            NOW()
        ) 
        RETURNING id INTO v_laptop_id;
    END IF;

    -- 4. Upsert or Link Configuration
    IF p_use_existing_config_id IS NOT NULL THEN
        SELECT id INTO v_config_id 
        FROM configurations 
        WHERE id = p_use_existing_config_id AND laptop_id = v_laptop_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Specified configuration % does not belong to laptop %', p_use_existing_config_id, v_laptop_id;
        END IF;
    ELSE
        INSERT INTO configurations (
            laptop_id, cpu, gpu, gpu_tgp_w, ram_gb, ram_speed_mt_s, 
            storage_gb, storage_type, display_size_inch, display_resolution, 
            refresh_rate_hz, panel_type, battery_wh, weight_kg, thickness_mm, created_at
        ) VALUES (
            v_laptop_id, 
            NULLIF(TRIM(p_config_json->>'cpu'), ''), 
            NULLIF(TRIM(p_config_json->>'gpu'), ''), 
            (NULLIF(p_config_json->>'gpu_tgp_w', ''))::INTEGER, 
            (NULLIF(p_config_json->>'ram_gb', ''))::INTEGER, 
            (NULLIF(p_config_json->>'ram_speed_mt_s', ''))::INTEGER, 
            (NULLIF(p_config_json->>'storage_gb', ''))::INTEGER, 
            NULLIF(TRIM(p_config_json->>'storage_type'), ''), 
            (NULLIF(p_config_json->>'display_size_inch', ''))::NUMERIC, 
            NULLIF(TRIM(p_config_json->>'display_resolution'), ''), 
            (NULLIF(p_config_json->>'refresh_rate_hz', ''))::INTEGER, 
            NULLIF(TRIM(p_config_json->>'panel_type'), ''), 
            (NULLIF(p_config_json->>'battery_wh', ''))::NUMERIC, 
            (NULLIF(p_config_json->>'weight_kg', ''))::NUMERIC, 
            (NULLIF(p_config_json->>'thickness_mm', ''))::NUMERIC,
            NOW()
        ) RETURNING id INTO v_config_id;
    END IF;

    -- 5. Insert Review Source
    INSERT INTO review_sources (
        configuration_id, youtube_url, youtube_video_id, title, reviewer, 
        published_date, verdict_summary, verdict_score, verdict_pros, verdict_cons, raw_data, created_at
    ) VALUES (
        v_config_id,
        p_review_json->>'youtube_url',
        v_review_video_id,
        COALESCE(NULLIF(TRIM(p_review_json->>'title'), ''), 'Untitled Review'),
        COALESCE(NULLIF(TRIM(p_review_json->>'reviewer'), ''), 'Unknown Reviewer'),
        NULLIF(TRIM(p_review_json->>'published_date'), ''),
        NULLIF(TRIM(p_review_json->>'verdict_summary'), ''),
        (NULLIF(p_review_json->>'verdict_score', ''))::NUMERIC,
        COALESCE(p_review_json->'verdict_pros', '[]'::jsonb),
        COALESCE(p_review_json->'verdict_cons', '[]'::jsonb),
        p_review_json->'raw_data',
        NOW()
    ) RETURNING id INTO v_review_id;

    -- 6. Insert Benchmarks
    IF p_benchmarks_json IS NOT NULL AND jsonb_array_length(p_benchmarks_json) > 0 THEN
        INSERT INTO benchmark_results (
            review_source_id, benchmark_group, variant, category, score, unit, power_mode, confidence, notes
        )
        SELECT 
            v_review_id,
            TRIM(value->>'benchmark_group'),
            NULLIF(TRIM(value->>'variant'), ''),
            COALESCE(NULLIF(TRIM(value->>'category'), ''), 'system'),
            (NULLIF(value->>'score', ''))::NUMERIC,
            NULLIF(TRIM(value->>'unit'), ''),
            NULLIF(TRIM(value->>'power_mode'), ''),
            COALESCE(NULLIF(TRIM(value->>'confidence'), ''), 'medium'),
            NULLIF(TRIM(value->>'notes'), '')
        FROM jsonb_array_elements(p_benchmarks_json)
        WHERE NULLIF(value->>'score', '') IS NOT NULL AND NULLIF(TRIM(value->>'benchmark_group'), '') IS NOT NULL;
    END IF;

    -- 7. Insert Gaming Results
    IF p_gaming_json IS NOT NULL AND jsonb_array_length(p_gaming_json) > 0 THEN
        INSERT INTO gaming_results (
            review_source_id, game, resolution, preset, ray_tracing, upscaling, upscaling_mode, avg_fps, one_percent_low_fps, notes
        )
        SELECT 
            v_review_id,
            TRIM(value->>'game'),
            NULLIF(TRIM(value->>'resolution'), ''),
            NULLIF(TRIM(value->>'preset'), ''),
            CASE WHEN value->>'ray_tracing' = 'true' THEN true WHEN value->>'ray_tracing' = 'false' THEN false ELSE NULL END,
            CASE WHEN value->>'upscaling' = 'true' THEN true WHEN value->>'upscaling' = 'false' THEN false ELSE NULL END,
            NULLIF(TRIM(value->>'upscaling_mode'), ''),
            (NULLIF(value->>'avg_fps', ''))::NUMERIC,
            (NULLIF(value->>'one_percent_low_fps', ''))::NUMERIC,
            NULLIF(TRIM(value->>'notes'), '')
        FROM jsonb_array_elements(p_gaming_json)
        WHERE NULLIF(TRIM(value->>'game'), '') IS NOT NULL;
    END IF;

    -- 8. Insert Thermal Results
    IF p_thermals_json IS NOT NULL AND jsonb_array_length(p_thermals_json) > 0 THEN
        INSERT INTO thermal_results (
            review_source_id, test_name, duration_minutes, cpu_peak_c, cpu_avg_c, cpu_peak_power_w, cpu_avg_power_w,
            gpu_peak_c, gpu_avg_c, keyboard_min_c, keyboard_max_c, notes
        )
        SELECT 
            v_review_id,
            TRIM(value->>'test_name'),
            (NULLIF(value->>'duration_minutes', ''))::NUMERIC,
            (NULLIF(value->>'cpu_peak_c', ''))::NUMERIC,
            (NULLIF(value->>'cpu_avg_c', ''))::NUMERIC,
            (NULLIF(value->>'cpu_peak_power_w', ''))::NUMERIC,
            (NULLIF(value->>'cpu_avg_power_w', ''))::NUMERIC,
            (NULLIF(value->>'gpu_peak_c', ''))::NUMERIC,
            (NULLIF(value->>'gpu_avg_c', ''))::NUMERIC,
            (NULLIF(value->>'keyboard_min_c', ''))::NUMERIC,
            (NULLIF(value->>'keyboard_max_c', ''))::NUMERIC,
            NULLIF(TRIM(value->>'notes'), '')
        FROM jsonb_array_elements(p_thermals_json)
        WHERE NULLIF(TRIM(value->>'test_name'), '') IS NOT NULL;
    END IF;

    -- 9. Insert Display Results
    IF p_display_json IS NOT NULL AND p_display_json != '{}'::jsonb AND p_display_json != 'null'::jsonb THEN
        INSERT INTO display_results (
            review_source_id, brightness_sdr_nits, brightness_hdr_nits, srgb_percent, dci_p3_percent,
            adobe_rgb_percent, response_time_ms, g_sync, vrr, notes
        ) VALUES (
            v_review_id,
            (NULLIF(p_display_json->>'brightness_sdr_nits', ''))::NUMERIC,
            (NULLIF(p_display_json->>'brightness_hdr_nits', ''))::NUMERIC,
            (NULLIF(p_display_json->>'srgb_percent', ''))::NUMERIC,
            (NULLIF(p_display_json->>'dci_p3_percent', ''))::NUMERIC,
            (NULLIF(p_display_json->>'adobe_rgb_percent', ''))::NUMERIC,
            (NULLIF(p_display_json->>'response_time_ms', ''))::NUMERIC,
            CASE WHEN p_display_json->>'g_sync' = 'true' THEN true WHEN p_display_json->>'g_sync' = 'false' THEN false ELSE NULL END,
            CASE WHEN p_display_json->>'vrr' = 'true' THEN true WHEN p_display_json->>'vrr' = 'false' THEN false ELSE NULL END,
            NULLIF(TRIM(p_display_json->>'notes'), '')
        );
    END IF;

    -- 10. Insert Battery Results
    IF p_battery_json IS NOT NULL AND p_battery_json != '{}'::jsonb AND p_battery_json != 'null'::jsonb THEN
        INSERT INTO battery_results (
            review_source_id, battery_life_hours, test_method, brightness_percent, gpu_mode,
            charging_adapter_w, zero_to_fifty_min, full_charge_min, usb_c_charging_w, notes
        ) VALUES (
            v_review_id,
            (NULLIF(p_battery_json->>'battery_life_hours', ''))::NUMERIC,
            NULLIF(TRIM(p_battery_json->>'test_method'), ''),
            (NULLIF(p_battery_json->>'brightness_percent', ''))::NUMERIC,
            NULLIF(TRIM(p_battery_json->>'gpu_mode'), ''),
            (NULLIF(p_battery_json->>'charging_adapter_w', ''))::NUMERIC,
            (NULLIF(p_battery_json->>'zero_to_fifty_min', ''))::NUMERIC,
            (NULLIF(p_battery_json->>'full_charge_min', ''))::NUMERIC,
            (NULLIF(p_battery_json->>'usb_c_charging_w', ''))::NUMERIC,
            NULLIF(TRIM(p_battery_json->>'notes'), '')
        );
    END IF;

    -- 11. Insert Evidence Records
    IF p_evidence_json IS NOT NULL AND jsonb_array_length(p_evidence_json) > 0 THEN
        INSERT INTO evidence_records (
            review_source_id, field_path, timestamp_seconds, timestamp_display,
            evidence_description, evidence_text, confidence, created_at
        )
        SELECT
            v_review_id,
            TRIM(value->>'field_path'),
            (NULLIF(value->>'timestamp_seconds', ''))::INTEGER,
            NULLIF(TRIM(value->>'timestamp_display'), ''),
            COALESCE(NULLIF(TRIM(value->>'evidence_description'), ''), 'Extracted metric evidence'),
            NULLIF(TRIM(value->>'evidence_text'), ''),
            COALESCE(NULLIF(TRIM(value->>'confidence'), ''), 'medium'),
            NOW()
        FROM jsonb_array_elements(p_evidence_json)
        WHERE NULLIF(TRIM(value->>'field_path'), '') IS NOT NULL;
    END IF;

    -- 12. Complete Job Row
    UPDATE extraction_jobs
    SET status = 'completed',
        review_source_id = v_review_id,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_job_id;

    -- Return JSON status object
    RETURN jsonb_build_object(
        'status', 'success',
        'review_source_id', v_review_id,
        'configuration_id', v_config_id,
        'laptop_id', v_laptop_id,
        'brand_id', v_brand_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION commit_reviewed_extraction_v2 TO anon, authenticated, service_role;
