-- Migration: 20260922000001_align_v2_schema_contract.sql
-- Description: Align database schema with V2 application requirements
-- Adds created_at to laptops, updated_at & execution tracking to extraction_jobs,
-- ensures evidence_records table exists, and defines the atomic review commit RPC.

-- 1. Add created_at to laptops for Browse sorting and ordering
ALTER TABLE laptops ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_laptops_created_at ON laptops(created_at DESC);

-- 2. Add required tracking columns to extraction_jobs
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS last_started_at TIMESTAMPTZ;
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS model_used TEXT;
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS processing_duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_updated_at ON extraction_jobs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_last_started ON extraction_jobs(last_started_at);

-- 3. Automatic updated_at trigger for extraction_jobs
CREATE OR REPLACE FUNCTION update_extraction_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_extraction_jobs_updated_at ON extraction_jobs;
CREATE TRIGGER trigger_update_extraction_jobs_updated_at
    BEFORE UPDATE ON extraction_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_extraction_jobs_updated_at();

-- 4. Evidence records table (supporting citation timestamps and field provenance)
CREATE TABLE IF NOT EXISTS evidence_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_source_id UUID NOT NULL REFERENCES review_sources(id) ON DELETE CASCADE,
    field_path TEXT NOT NULL,
    timestamp_seconds INTEGER CHECK (timestamp_seconds IS NULL OR timestamp_seconds >= 0),
    timestamp_display TEXT,
    evidence_description TEXT NOT NULL,
    evidence_text TEXT,
    confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evidence_records_review_source_id ON evidence_records(review_source_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_field_path ON evidence_records(field_path);

-- 5. Atomic Review Commit RPC Function
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
BEGIN
    -- 1. Validate & Lock Job
    SELECT status, youtube_video_id INTO v_job_status, v_job_video_id
    FROM extraction_jobs WHERE id = p_job_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Job % not found', p_job_id;
    END IF;

    -- Idempotency check: if job was already completed, return existing review info
    IF v_job_status = 'completed' THEN
        SELECT id, configuration_id INTO v_review_id, v_config_id 
        FROM review_sources WHERE youtube_video_id = v_job_video_id LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object(
                'status', 'idempotent_success',
                'review_source_id', v_review_id,
                'configuration_id', v_config_id
            );
        END IF;
    END IF;

    v_review_video_id := p_review_json->>'youtube_video_id';
    IF v_review_video_id IS NULL OR v_review_video_id != v_job_video_id THEN
        RAISE EXCEPTION 'YouTube video ID mismatch between job and review payload';
    END IF;

    -- Check if another review already ingested this video
    SELECT id INTO v_review_id FROM review_sources WHERE youtube_video_id = v_review_video_id LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Video ID % has already been committed as review %', v_review_video_id, v_review_id;
    END IF;

    -- 2. Upsert Brand
    SELECT id INTO v_brand_id FROM laptop_brands WHERE LOWER(name) = LOWER(TRIM(p_brand_name));
    IF NOT FOUND THEN
        INSERT INTO laptop_brands (name) VALUES (TRIM(p_brand_name)) RETURNING id INTO v_brand_id;
    END IF;

    -- 3. Upsert Laptop
    SELECT id INTO v_laptop_id FROM laptops 
    WHERE brand_id = v_brand_id 
      AND LOWER(model) = LOWER(TRIM(p_laptop_model))
      AND COALESCE(LOWER(series), '') = COALESCE(LOWER(TRIM(p_laptop_series)), '')
      AND COALESCE(LOWER(generation), '') = COALESCE(LOWER(TRIM(p_laptop_generation)), '');

    IF NOT FOUND THEN
        INSERT INTO laptops (brand_id, model, series, generation) 
        VALUES (v_brand_id, TRIM(p_laptop_model), NULLIF(TRIM(p_laptop_series), ''), NULLIF(TRIM(p_laptop_generation), '')) 
        RETURNING id INTO v_laptop_id;
    END IF;

    -- 4. Configuration: Link existing or insert new
    IF p_use_existing_config_id IS NOT NULL THEN
        SELECT id INTO v_config_id FROM configurations 
        WHERE id = p_use_existing_config_id AND laptop_id = v_laptop_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Specified configuration % does not belong to laptop %', p_use_existing_config_id, v_laptop_id;
        END IF;
    ELSE
        INSERT INTO configurations (
            laptop_id, cpu, gpu, gpu_tgp_w, ram_gb, ram_speed_mt_s, 
            storage_gb, storage_type, display_size_inch, display_resolution, 
            refresh_rate_hz, panel_type, battery_wh, weight_kg, thickness_mm
        ) VALUES (
            v_laptop_id, 
            NULLIF(TRIM(p_config_json->>'cpu'), ''), 
            NULLIF(TRIM(p_config_json->>'gpu'), ''), 
            (p_config_json->>'gpu_tgp_w')::INTEGER, 
            (p_config_json->>'ram_gb')::INTEGER, 
            (p_config_json->>'ram_speed_mt_s')::INTEGER, 
            (p_config_json->>'storage_gb')::INTEGER, 
            NULLIF(TRIM(p_config_json->>'storage_type'), ''), 
            (p_config_json->>'display_size_inch')::NUMERIC, 
            NULLIF(TRIM(p_config_json->>'display_resolution'), ''), 
            (p_config_json->>'refresh_rate_hz')::INTEGER, 
            NULLIF(TRIM(p_config_json->>'panel_type'), ''), 
            (p_config_json->>'battery_wh')::NUMERIC, 
            (p_config_json->>'weight_kg')::NUMERIC, 
            (p_config_json->>'thickness_mm')::NUMERIC
        ) RETURNING id INTO v_config_id;
    END IF;

    -- 5. Insert Review Source
    INSERT INTO review_sources (
        configuration_id, youtube_url, youtube_video_id, title, reviewer, 
        published_date, verdict_summary, verdict_score, verdict_pros, verdict_cons, raw_data
    ) VALUES (
        v_config_id,
        p_review_json->>'youtube_url',
        v_review_video_id,
        COALESCE(TRIM(p_review_json->>'title'), 'Untitled Review'),
        COALESCE(TRIM(p_review_json->>'reviewer'), 'Unknown Reviewer'),
        NULLIF(TRIM(p_review_json->>'published_date'), ''),
        NULLIF(TRIM(p_review_json->>'verdict_summary'), ''),
        (p_review_json->>'verdict_score')::NUMERIC,
        COALESCE(p_review_json->'verdict_pros', '[]'::jsonb),
        COALESCE(p_review_json->'verdict_cons', '[]'::jsonb),
        p_review_json->'raw_data'
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
            COALESCE(value->>'category', 'system'),
            (value->>'score')::NUMERIC,
            NULLIF(TRIM(value->>'unit'), ''),
            NULLIF(TRIM(value->>'power_mode'), ''),
            COALESCE(value->>'confidence', 'medium'),
            NULLIF(TRIM(value->>'notes'), '')
        FROM jsonb_array_elements(p_benchmarks_json)
        WHERE (value->>'score') IS NOT NULL;
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
            (value->>'ray_tracing')::BOOLEAN,
            (value->>'upscaling')::BOOLEAN,
            NULLIF(TRIM(value->>'upscaling_mode'), ''),
            (value->>'avg_fps')::NUMERIC,
            (value->>'one_percent_low_fps')::NUMERIC,
            NULLIF(TRIM(value->>'notes'), '')
        FROM jsonb_array_elements(p_gaming_json)
        WHERE value->>'game' IS NOT NULL;
    END IF;

    -- 8. Insert Thermals
    IF p_thermals_json IS NOT NULL AND jsonb_array_length(p_thermals_json) > 0 THEN
        INSERT INTO thermal_results (
            review_source_id, test_name, duration_minutes, cpu_peak_c, cpu_avg_c, cpu_peak_power_w, cpu_avg_power_w,
            gpu_peak_c, gpu_avg_c, keyboard_min_c, keyboard_max_c, notes
        )
        SELECT 
            v_review_id,
            TRIM(value->>'test_name'),
            (value->>'duration_minutes')::NUMERIC,
            (value->>'cpu_peak_c')::NUMERIC,
            (value->>'cpu_avg_c')::NUMERIC,
            (value->>'cpu_peak_power_w')::NUMERIC,
            (value->>'cpu_avg_power_w')::NUMERIC,
            (value->>'gpu_peak_c')::NUMERIC,
            (value->>'gpu_avg_c')::NUMERIC,
            (value->>'keyboard_min_c')::NUMERIC,
            (value->>'keyboard_max_c')::NUMERIC,
            NULLIF(TRIM(value->>'notes'), '')
        FROM jsonb_array_elements(p_thermals_json)
        WHERE value->>'test_name' IS NOT NULL;
    END IF;

    -- 9. Insert Display
    IF p_display_json IS NOT NULL AND p_display_json != 'null'::jsonb THEN
        INSERT INTO display_results (
            review_source_id, brightness_sdr_nits, brightness_hdr_nits, srgb_percent, dci_p3_percent,
            adobe_rgb_percent, response_time_ms, g_sync, vrr, notes
        ) VALUES (
            v_review_id,
            (p_display_json->>'brightness_sdr_nits')::NUMERIC,
            (p_display_json->>'brightness_hdr_nits')::NUMERIC,
            (p_display_json->>'srgb_percent')::NUMERIC,
            (p_display_json->>'dci_p3_percent')::NUMERIC,
            (p_display_json->>'adobe_rgb_percent')::NUMERIC,
            (p_display_json->>'response_time_ms')::NUMERIC,
            (p_display_json->>'g_sync')::BOOLEAN,
            (p_display_json->>'vrr')::BOOLEAN,
            NULLIF(TRIM(p_display_json->>'notes'), '')
        );
    END IF;

    -- 10. Insert Battery
    IF p_battery_json IS NOT NULL AND p_battery_json != 'null'::jsonb THEN
        INSERT INTO battery_results (
            review_source_id, battery_life_hours, test_method, brightness_percent, gpu_mode,
            charging_adapter_w, zero_to_fifty_min, full_charge_min, usb_c_charging_w, notes
        ) VALUES (
            v_review_id,
            (p_battery_json->>'battery_life_hours')::NUMERIC,
            NULLIF(TRIM(p_battery_json->>'test_method'), ''),
            (p_battery_json->>'brightness_percent')::NUMERIC,
            NULLIF(TRIM(p_battery_json->>'gpu_mode'), ''),
            (p_battery_json->>'charging_adapter_w')::NUMERIC,
            (p_battery_json->>'zero_to_fifty_min')::NUMERIC,
            (p_battery_json->>'full_charge_min')::NUMERIC,
            (p_battery_json->>'usb_c_charging_w')::NUMERIC,
            NULLIF(TRIM(p_battery_json->>'notes'), '')
        );
    END IF;

    -- 11. Insert Evidence
    IF p_evidence_json IS NOT NULL AND jsonb_array_length(p_evidence_json) > 0 THEN
        INSERT INTO evidence_records (
            review_source_id, field_path, timestamp_seconds, timestamp_display,
            evidence_description, evidence_text, confidence
        )
        SELECT
            v_review_id,
            TRIM(value->>'field_path'),
            (value->>'timestamp_seconds')::INTEGER,
            NULLIF(TRIM(value->>'timestamp_display'), ''),
            TRIM(value->>'evidence_description'),
            NULLIF(TRIM(value->>'evidence_text'), ''),
            COALESCE(value->>'confidence', 'medium')
        FROM jsonb_array_elements(p_evidence_json)
        WHERE value->>'field_path' IS NOT NULL;
    END IF;

    -- 12. Transition extraction job status to 'completed'
    UPDATE extraction_jobs
    SET status = 'completed',
        review_source_id = v_review_id,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_job_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'review_source_id', v_review_id,
        'configuration_id', v_config_id,
        'laptop_id', v_laptop_id,
        'brand_id', v_brand_id
    );
END;
$$ LANGUAGE plpgsql;

-- Backward compatibility alias
CREATE OR REPLACE FUNCTION commit_reviewed_extraction(
    p_job_id UUID,
    p_data JSONB,
    p_retail_listings JSONB DEFAULT '[]'::jsonb
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('status', 'v1_deprecated_use_v2');
END;
$$ LANGUAGE plpgsql;
