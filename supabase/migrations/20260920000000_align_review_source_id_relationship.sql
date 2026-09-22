-- Migration: Align review_source_id relationship across child benchmark/gaming/thermal/display/battery tables
-- Safe for already-existing databases: renames review_id to review_source_id if present without dropping data.

DO $$
BEGIN
    -- 1. benchmark_results
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'benchmark_results' AND column_name = 'review_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'benchmark_results' AND column_name = 'review_source_id'
    ) THEN
        ALTER TABLE benchmark_results RENAME COLUMN review_id TO review_source_id;
    END IF;

    -- 2. gaming_results
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gaming_results' AND column_name = 'review_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gaming_results' AND column_name = 'review_source_id'
    ) THEN
        ALTER TABLE gaming_results RENAME COLUMN review_id TO review_source_id;
    END IF;

    -- 3. thermal_results
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'thermal_results' AND column_name = 'review_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'thermal_results' AND column_name = 'review_source_id'
    ) THEN
        ALTER TABLE thermal_results RENAME COLUMN review_id TO review_source_id;
    END IF;

    -- 4. display_results
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'display_results' AND column_name = 'review_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'display_results' AND column_name = 'review_source_id'
    ) THEN
        ALTER TABLE display_results RENAME COLUMN review_id TO review_source_id;
    END IF;

    -- 5. battery_results
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'battery_results' AND column_name = 'review_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'battery_results' AND column_name = 'review_source_id'
    ) THEN
        ALTER TABLE battery_results RENAME COLUMN review_id TO review_source_id;
    END IF;
END $$;

-- Update indexes for review_source_id
CREATE INDEX IF NOT EXISTS idx_benchmark_results_review_source_id ON benchmark_results(review_source_id);
CREATE INDEX IF NOT EXISTS idx_gaming_results_review_source_id ON gaming_results(review_source_id);
CREATE INDEX IF NOT EXISTS idx_thermal_results_review_source_id ON thermal_results(review_source_id);

-- Update Atomic Commit RPC to use canonical review_source_id
CREATE OR REPLACE FUNCTION commit_reviewed_extraction(
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
    p_use_existing_config_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_brand_id UUID;
    v_laptop_id UUID;
    v_config_id UUID;
    v_review_id UUID;
    v_job_status TEXT;
    v_job_video_id TEXT;
    v_review_video_id TEXT;
BEGIN
    -- 1. Validate job
    SELECT status, youtube_video_id INTO v_job_status, v_job_video_id
    FROM extraction_jobs WHERE id = p_job_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Job not found';
    END IF;

    IF v_job_status NOT IN ('ready_for_review', 'failed', 'processing') THEN
        IF v_job_status = 'completed' THEN
            -- Check if review already exists for idempotency
            SELECT id INTO v_review_id FROM review_sources WHERE youtube_video_id = v_job_video_id LIMIT 1;
            IF FOUND THEN
                RETURN v_review_id;
            END IF;
        END IF;
    END IF;
    
    v_review_video_id := p_review_json->>'youtube_video_id';
    IF v_review_video_id != v_job_video_id THEN
        RAISE EXCEPTION 'YouTube video ID mismatch';
    END IF;

    -- 2. Find or create brand
    SELECT id INTO v_brand_id FROM laptop_brands WHERE LOWER(name) = LOWER(p_brand_name);
    IF NOT FOUND THEN
        INSERT INTO laptop_brands (name) VALUES (p_brand_name) RETURNING id INTO v_brand_id;
    END IF;

    -- 3. Find or create laptop
    SELECT id INTO v_laptop_id FROM laptops 
    WHERE brand_id = v_brand_id 
      AND LOWER(model) = LOWER(p_laptop_model)
      AND COALESCE(LOWER(series), '') = COALESCE(LOWER(p_laptop_series), '')
      AND COALESCE(LOWER(generation), '') = COALESCE(LOWER(p_laptop_generation), '');

    IF NOT FOUND THEN
        INSERT INTO laptops (brand_id, model, series, generation) 
        VALUES (v_brand_id, p_laptop_model, p_laptop_series, p_laptop_generation) 
        RETURNING id INTO v_laptop_id;
    END IF;

    -- 4. Find or create config
    IF p_use_existing_config_id IS NOT NULL THEN
        SELECT id INTO v_config_id FROM configurations 
        WHERE id = p_use_existing_config_id AND laptop_id = v_laptop_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Provided configuration ID does not match the laptop';
        END IF;
    ELSE
        INSERT INTO configurations (
            laptop_id, cpu, gpu, gpu_tgp_w, ram_gb, ram_speed_mt_s, 
            storage_gb, storage_type, display_size_inch, display_resolution, 
            refresh_rate_hz, panel_type, battery_wh, weight_kg, thickness_mm
        ) VALUES (
            v_laptop_id, 
            p_config_json->>'cpu', 
            p_config_json->>'gpu', 
            (p_config_json->>'gpu_tgp_w')::INTEGER, 
            (p_config_json->>'ram_gb')::INTEGER, 
            (p_config_json->>'ram_speed_mt_s')::INTEGER, 
            (p_config_json->>'storage_gb')::INTEGER, 
            p_config_json->>'storage_type', 
            (p_config_json->>'display_size_inch')::NUMERIC, 
            p_config_json->>'display_resolution', 
            (p_config_json->>'refresh_rate_hz')::INTEGER, 
            p_config_json->>'panel_type', 
            (p_config_json->>'battery_wh')::NUMERIC, 
            (p_config_json->>'weight_kg')::NUMERIC, 
            (p_config_json->>'thickness_mm')::NUMERIC
        ) RETURNING id INTO v_config_id;
    END IF;

    -- 5. Insert review source
    INSERT INTO review_sources (
        configuration_id, youtube_url, youtube_video_id, title, reviewer, 
        published_date, verdict_summary, verdict_score, verdict_pros, verdict_cons, raw_data
    ) VALUES (
        v_config_id,
        p_review_json->>'youtube_url',
        v_review_video_id,
        p_review_json->>'title',
        p_review_json->>'reviewer',
        p_review_json->>'published_date',
        p_review_json->>'verdict_summary',
        (p_review_json->>'verdict_score')::NUMERIC,
        COALESCE(p_review_json->'verdict_pros', '[]'::jsonb),
        COALESCE(p_review_json->'verdict_cons', '[]'::jsonb),
        p_review_json->'raw_data'
    ) RETURNING id INTO v_review_id;

    -- 6. Insert sub-results with canonical review_source_id foreign key
    IF jsonb_array_length(p_benchmarks_json) > 0 THEN
        INSERT INTO benchmark_results (review_source_id, benchmark_group, variant, category, score, unit, power_mode, confidence, notes)
        SELECT v_review_id, value->>'benchmark_group', value->>'variant', value->>'category', (value->>'score')::NUMERIC, value->>'unit', value->>'power_mode', COALESCE(value->>'confidence', 'medium'), value->>'notes'
        FROM jsonb_array_elements(p_benchmarks_json);
    END IF;

    IF jsonb_array_length(p_gaming_json) > 0 THEN
        INSERT INTO gaming_results (review_source_id, game, resolution, preset, ray_tracing, upscaling, upscaling_mode, avg_fps, one_percent_low_fps, notes)
        SELECT v_review_id, value->>'game', value->>'resolution', value->>'preset', (value->>'ray_tracing')::BOOLEAN, (value->>'upscaling')::BOOLEAN, value->>'upscaling_mode', (value->>'avg_fps')::NUMERIC, (value->>'one_percent_low_fps')::NUMERIC, value->>'notes'
        FROM jsonb_array_elements(p_gaming_json);
    END IF;

    IF jsonb_array_length(p_thermals_json) > 0 THEN
        INSERT INTO thermal_results (review_source_id, test_name, duration_minutes, cpu_peak_c, cpu_avg_c, cpu_peak_power_w, cpu_avg_power_w, gpu_peak_c, gpu_avg_c, keyboard_min_c, keyboard_max_c, notes)
        SELECT v_review_id, value->>'test_name', (value->>'duration_minutes')::NUMERIC, (value->>'cpu_peak_c')::NUMERIC, (value->>'cpu_avg_c')::NUMERIC, (value->>'cpu_peak_power_w')::NUMERIC, (value->>'cpu_avg_power_w')::NUMERIC, (value->>'gpu_peak_c')::NUMERIC, (value->>'gpu_avg_c')::NUMERIC, (value->>'keyboard_min_c')::NUMERIC, (value->>'keyboard_max_c')::NUMERIC, value->>'notes'
        FROM jsonb_array_elements(p_thermals_json);
    END IF;

    IF p_display_json IS NOT NULL AND p_display_json::text != 'null' THEN
        INSERT INTO display_results (review_source_id, brightness_sdr_nits, brightness_hdr_nits, srgb_percent, dci_p3_percent, adobe_rgb_percent, response_time_ms, g_sync, vrr, notes)
        VALUES (v_review_id, (p_display_json->>'brightness_sdr_nits')::NUMERIC, (p_display_json->>'brightness_hdr_nits')::NUMERIC, (p_display_json->>'srgb_percent')::NUMERIC, (p_display_json->>'dci_p3_percent')::NUMERIC, (p_display_json->>'adobe_rgb_percent')::NUMERIC, (p_display_json->>'response_time_ms')::NUMERIC, (p_display_json->>'g_sync')::BOOLEAN, (p_display_json->>'vrr')::BOOLEAN, p_display_json->>'notes');
    END IF;

    IF p_battery_json IS NOT NULL AND p_battery_json::text != 'null' THEN
        INSERT INTO battery_results (review_source_id, battery_life_hours, test_method, brightness_percent, gpu_mode, charging_adapter_w, zero_to_fifty_min, full_charge_min, usb_c_charging_w, notes)
        VALUES (v_review_id, (p_battery_json->>'battery_life_hours')::NUMERIC, p_battery_json->>'test_method', (p_battery_json->>'brightness_percent')::NUMERIC, p_battery_json->>'gpu_mode', (p_battery_json->>'charging_adapter_w')::NUMERIC, (p_battery_json->>'zero_to_fifty_min')::NUMERIC, (p_battery_json->>'full_charge_min')::NUMERIC, (p_battery_json->>'usb_c_charging_w')::NUMERIC, p_battery_json->>'notes');
    END IF;

    -- 7. Update extraction job (note: no unsupported updated_at column)
    UPDATE extraction_jobs 
    SET status = 'completed', review_source_id = v_review_id 
    WHERE id = p_job_id;

    RETURN v_review_id;
END;
$$ LANGUAGE plpgsql;
