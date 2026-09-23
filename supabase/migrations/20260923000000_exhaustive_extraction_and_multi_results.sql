-- Migration: 20260923000000_exhaustive_extraction_and_multi_results.sql
-- Description: Supports multi-record display/battery results, exhaustive performance columns, and enhanced commit RPC.

-- 1. Remove UNIQUE constraints on display_results and battery_results to allow multiple lab tests per review
DO $$
BEGIN
    ALTER TABLE display_results DROP CONSTRAINT IF EXISTS display_results_review_source_id_key;
    ALTER TABLE battery_results DROP CONSTRAINT IF EXISTS battery_results_review_source_id_key;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 2. Add additive performance columns to benchmark_results
ALTER TABLE benchmark_results ADD COLUMN IF NOT EXISTS benchmark_version TEXT;
ALTER TABLE benchmark_results ADD COLUMN IF NOT EXISTS score_type TEXT;
ALTER TABLE benchmark_results ADD COLUMN IF NOT EXISTS settings_notes TEXT;

-- 3. Add additive performance columns to gaming_results
ALTER TABLE gaming_results ADD COLUMN IF NOT EXISTS zero_point_one_percent_low_fps NUMERIC;
ALTER TABLE gaming_results ADD COLUMN IF NOT EXISTS minimum_fps NUMERIC;
ALTER TABLE gaming_results ADD COLUMN IF NOT EXISTS frame_generation BOOLEAN;
ALTER TABLE gaming_results ADD COLUMN IF NOT EXISTS gpu_mode TEXT;
ALTER TABLE gaming_results ADD COLUMN IF NOT EXISTS power_mode TEXT;

-- 4. Add additive performance columns to thermal_results
ALTER TABLE thermal_results ADD COLUMN IF NOT EXISTS gpu_peak_power_w NUMERIC;
ALTER TABLE thermal_results ADD COLUMN IF NOT EXISTS gpu_avg_power_w NUMERIC;
ALTER TABLE thermal_results ADD COLUMN IF NOT EXISTS sustained_wattage_w NUMERIC;
ALTER TABLE thermal_results ADD COLUMN IF NOT EXISTS fan_noise_db NUMERIC;
ALTER TABLE thermal_results ADD COLUMN IF NOT EXISTS ambient_temp_c NUMERIC;
ALTER TABLE thermal_results ADD COLUMN IF NOT EXISTS power_mode TEXT;

-- 5. Add additive performance columns to display_results
ALTER TABLE display_results ADD COLUMN IF NOT EXISTS test_name TEXT;
ALTER TABLE display_results ADD COLUMN IF NOT EXISTS contrast_ratio TEXT;
ALTER TABLE display_results ADD COLUMN IF NOT EXISTS delta_e NUMERIC;

-- 6. Updated Atomic Commit RPC Function V2 supporting multi-result arrays and additive fields
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
    v_elem JSONB;
BEGIN
    -- 1. Validate & Lock Job
    SELECT status, youtube_video_id INTO v_job_status, v_job_video_id
    FROM extraction_jobs WHERE id = p_job_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Job % not found', p_job_id;
    END IF;

    -- Idempotency check: if job was already completed, verify existing review
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

    -- 6. Insert Benchmarks with review_source_id
    IF p_benchmarks_json IS NOT NULL AND jsonb_array_length(p_benchmarks_json) > 0 THEN
        INSERT INTO benchmark_results (
            review_source_id, benchmark_group, benchmark_version, variant, category, score, score_type, unit, power_mode, confidence, settings_notes, notes
        )
        SELECT 
            v_review_id,
            TRIM(value->>'benchmark_group'),
            NULLIF(TRIM(value->>'benchmark_version'), ''),
            NULLIF(TRIM(value->>'variant'), ''),
            COALESCE(value->>'category', 'system'),
            (value->>'score')::NUMERIC,
            NULLIF(TRIM(value->>'score_type'), ''),
            NULLIF(TRIM(value->>'unit'), ''),
            NULLIF(TRIM(value->>'power_mode'), ''),
            COALESCE(value->>'confidence', 'medium'),
            NULLIF(TRIM(value->>'settings_notes'), ''),
            NULLIF(TRIM(value->>'notes'), '')
        FROM jsonb_array_elements(p_benchmarks_json)
        WHERE (value->>'score') IS NOT NULL;
    END IF;

    -- 7. Insert Gaming Results with review_source_id
    IF p_gaming_json IS NOT NULL AND jsonb_array_length(p_gaming_json) > 0 THEN
        INSERT INTO gaming_results (
            review_source_id, game, resolution, preset, ray_tracing, upscaling, upscaling_mode, frame_generation, gpu_mode, power_mode, avg_fps, one_percent_low_fps, zero_point_one_percent_low_fps, minimum_fps, notes
        )
        SELECT 
            v_review_id,
            TRIM(value->>'game'),
            NULLIF(TRIM(value->>'resolution'), ''),
            NULLIF(TRIM(value->>'preset'), ''),
            (value->>'ray_tracing')::BOOLEAN,
            (value->>'upscaling')::BOOLEAN,
            NULLIF(TRIM(value->>'upscaling_mode'), ''),
            (value->>'frame_generation')::BOOLEAN,
            NULLIF(TRIM(value->>'gpu_mode'), ''),
            NULLIF(TRIM(value->>'power_mode'), ''),
            (value->>'avg_fps')::NUMERIC,
            (value->>'one_percent_low_fps')::NUMERIC,
            (value->>'zero_point_one_percent_low_fps')::NUMERIC,
            (value->>'minimum_fps')::NUMERIC,
            NULLIF(TRIM(value->>'notes'), '')
        FROM jsonb_array_elements(p_gaming_json);
    END IF;

    -- 8. Insert Thermal Results with review_source_id
    IF p_thermals_json IS NOT NULL AND jsonb_array_length(p_thermals_json) > 0 THEN
        INSERT INTO thermal_results (
            review_source_id, test_name, duration_minutes, cpu_peak_c, cpu_avg_c, cpu_peak_power_w, cpu_avg_power_w, gpu_peak_c, gpu_avg_c, gpu_peak_power_w, gpu_avg_power_w, sustained_wattage_w, fan_noise_db, ambient_temp_c, keyboard_min_c, keyboard_max_c, power_mode, notes
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
            (value->>'gpu_peak_power_w')::NUMERIC,
            (value->>'gpu_avg_power_w')::NUMERIC,
            (value->>'sustained_wattage_w')::NUMERIC,
            (value->>'fan_noise_db')::NUMERIC,
            (value->>'ambient_temp_c')::NUMERIC,
            (value->>'keyboard_min_c')::NUMERIC,
            (value->>'keyboard_max_c')::NUMERIC,
            NULLIF(TRIM(value->>'power_mode'), ''),
            NULLIF(TRIM(value->>'notes'), '')
        FROM jsonb_array_elements(p_thermals_json);
    END IF;

    -- 9. Insert Display Results (Supports both Array and Object)
    IF p_display_json IS NOT NULL AND p_display_json::text != 'null' THEN
        IF jsonb_typeof(p_display_json) = 'array' THEN
            INSERT INTO display_results (
                review_source_id, test_name, brightness_sdr_nits, brightness_hdr_nits, srgb_percent, dci_p3_percent, adobe_rgb_percent, response_time_ms, contrast_ratio, delta_e, g_sync, vrr, notes
            )
            SELECT
                v_review_id,
                NULLIF(TRIM(value->>'test_name'), ''),
                (value->>'brightness_sdr_nits')::NUMERIC,
                (value->>'brightness_hdr_nits')::NUMERIC,
                (value->>'srgb_percent')::NUMERIC,
                (value->>'dci_p3_percent')::NUMERIC,
                (value->>'adobe_rgb_percent')::NUMERIC,
                (value->>'response_time_ms')::NUMERIC,
                NULLIF(TRIM(value->>'contrast_ratio'), ''),
                (value->>'delta_e')::NUMERIC,
                (value->>'g_sync')::BOOLEAN,
                (value->>'vrr')::BOOLEAN,
                NULLIF(TRIM(value->>'notes'), '')
            FROM jsonb_array_elements(p_display_json)
            WHERE (value->>'brightness_sdr_nits') IS NOT NULL 
               OR (value->>'srgb_percent') IS NOT NULL 
               OR (value->>'dci_p3_percent') IS NOT NULL;
        ELSE
            INSERT INTO display_results (
                review_source_id, test_name, brightness_sdr_nits, brightness_hdr_nits, srgb_percent, dci_p3_percent, adobe_rgb_percent, response_time_ms, contrast_ratio, delta_e, g_sync, vrr, notes
            ) VALUES (
                v_review_id,
                NULLIF(TRIM(p_display_json->>'test_name'), ''),
                (p_display_json->>'brightness_sdr_nits')::NUMERIC,
                (p_display_json->>'brightness_hdr_nits')::NUMERIC,
                (p_display_json->>'srgb_percent')::NUMERIC,
                (p_display_json->>'dci_p3_percent')::NUMERIC,
                (p_display_json->>'adobe_rgb_percent')::NUMERIC,
                (p_display_json->>'response_time_ms')::NUMERIC,
                NULLIF(TRIM(p_display_json->>'contrast_ratio'), ''),
                (p_display_json->>'delta_e')::NUMERIC,
                (p_display_json->>'g_sync')::BOOLEAN,
                (p_display_json->>'vrr')::BOOLEAN,
                NULLIF(TRIM(p_display_json->>'notes'), '')
            );
        END IF;
    END IF;

    -- 10. Insert Battery Results (Supports both Array and Object)
    IF p_battery_json IS NOT NULL AND p_battery_json::text != 'null' THEN
        IF jsonb_typeof(p_battery_json) = 'array' THEN
            INSERT INTO battery_results (
                review_source_id, battery_life_hours, test_method, brightness_percent, gpu_mode, charging_adapter_w, zero_to_fifty_min, full_charge_min, usb_c_charging_w, notes
            )
            SELECT
                v_review_id,
                (value->>'battery_life_hours')::NUMERIC,
                NULLIF(TRIM(value->>'test_method'), ''),
                (value->>'brightness_percent')::NUMERIC,
                NULLIF(TRIM(value->>'gpu_mode'), ''),
                (value->>'charging_adapter_w')::NUMERIC,
                (value->>'zero_to_fifty_min')::NUMERIC,
                (value->>'full_charge_min')::NUMERIC,
                (value->>'usb_c_charging_w')::NUMERIC,
                NULLIF(TRIM(value->>'notes'), '')
            FROM jsonb_array_elements(p_battery_json)
            WHERE (value->>'battery_life_hours') IS NOT NULL 
               OR (value->>'charging_adapter_w') IS NOT NULL 
               OR (value->>'test_method') IS NOT NULL;
        ELSE
            INSERT INTO battery_results (
                review_source_id, battery_life_hours, test_method, brightness_percent, gpu_mode, charging_adapter_w, zero_to_fifty_min, full_charge_min, usb_c_charging_w, notes
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
    END IF;

    -- 11. Insert Evidence Records with review_source_id
    IF p_evidence_json IS NOT NULL AND jsonb_array_length(p_evidence_json) > 0 THEN
        INSERT INTO evidence_records (
            review_source_id, field_path, timestamp_seconds, timestamp_display, evidence_description, evidence_text, confidence
        )
        SELECT 
            v_review_id,
            TRIM(value->>'field_path'),
            (value->>'timestamp_seconds')::INTEGER,
            NULLIF(TRIM(value->>'timestamp_display'), ''),
            TRIM(value->>'evidence_description'),
            NULLIF(TRIM(value->>'evidence_text'), ''),
            COALESCE(value->>'confidence', 'medium')
        FROM jsonb_array_elements(p_evidence_json);
    END IF;

    -- 12. Create Review Audit Trail Entry
    INSERT INTO review_audits (
        review_source_id, reviewer_identity, action, diff_summary
    ) VALUES (
        v_review_id,
        COALESCE(NULLIF(TRIM(p_reviewer_identity), ''), 'admin_reviewer'),
        'created',
        jsonb_build_object(
            'brand', p_brand_name,
            'model', p_laptop_model,
            'benchmarks_count', jsonb_array_length(COALESCE(p_benchmarks_json, '[]'::jsonb)),
            'gaming_count', jsonb_array_length(COALESCE(p_gaming_json, '[]'::jsonb)),
            'thermals_count', jsonb_array_length(COALESCE(p_thermals_json, '[]'::jsonb)),
            'evidence_count', jsonb_array_length(COALESCE(p_evidence_json, '[]'::jsonb))
        )
    );

    -- 13. Update Job status to 'completed'
    UPDATE extraction_jobs 
    SET status = 'completed',
        review_source_id = v_review_id,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_job_id;

    -- 14. Return success result
    RETURN jsonb_build_object(
        'status', 'success',
        'review_source_id', v_review_id,
        'configuration_id', v_config_id,
        'laptop_id', v_laptop_id,
        'brand_id', v_brand_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
