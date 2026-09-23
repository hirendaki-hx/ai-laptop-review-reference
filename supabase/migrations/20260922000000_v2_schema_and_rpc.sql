-- V2 Production Schema Migration
-- AI Laptop Review Platform V2: Complete 14-table relational model with atomic RPC commit and RLS

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. laptop_brands
CREATE TABLE IF NOT EXISTS laptop_brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_brand_name_idx ON laptop_brands (LOWER(name));

-- 2. laptops
CREATE TABLE IF NOT EXISTS laptops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES laptop_brands(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    series TEXT,
    generation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_laptop_idx ON laptops (
    brand_id, 
    LOWER(model), 
    COALESCE(LOWER(series), ''), 
    COALESCE(LOWER(generation), '')
);
CREATE INDEX IF NOT EXISTS idx_laptops_brand_id ON laptops(brand_id);

-- 3. configurations
CREATE TABLE IF NOT EXISTS configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    laptop_id UUID NOT NULL REFERENCES laptops(id) ON DELETE CASCADE,
    cpu TEXT,
    gpu TEXT,
    gpu_tgp_w INTEGER CHECK (gpu_tgp_w IS NULL OR gpu_tgp_w > 0),
    ram_gb INTEGER CHECK (ram_gb IS NULL OR ram_gb > 0),
    ram_speed_mt_s INTEGER CHECK (ram_speed_mt_s IS NULL OR ram_speed_mt_s > 0),
    storage_gb INTEGER CHECK (storage_gb IS NULL OR storage_gb > 0),
    storage_type TEXT,
    display_size_inch NUMERIC CHECK (display_size_inch IS NULL OR display_size_inch > 0),
    display_resolution TEXT,
    refresh_rate_hz INTEGER CHECK (refresh_rate_hz IS NULL OR refresh_rate_hz > 0),
    panel_type TEXT,
    battery_wh NUMERIC CHECK (battery_wh IS NULL OR battery_wh > 0),
    weight_kg NUMERIC CHECK (weight_kg IS NULL OR weight_kg > 0),
    thickness_mm NUMERIC CHECK (thickness_mm IS NULL OR thickness_mm > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_configurations_laptop_id ON configurations(laptop_id);

-- 4. review_sources
CREATE TABLE IF NOT EXISTS review_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    configuration_id UUID NOT NULL REFERENCES configurations(id) ON DELETE CASCADE,
    youtube_url TEXT NOT NULL,
    youtube_video_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    reviewer TEXT NOT NULL,
    published_date TEXT,
    verdict_summary TEXT,
    verdict_score NUMERIC CHECK (verdict_score IS NULL OR (verdict_score >= 0 AND verdict_score <= 10)),
    verdict_pros JSONB DEFAULT '[]'::jsonb,
    verdict_cons JSONB DEFAULT '[]'::jsonb,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_review_sources_config_id ON review_sources(configuration_id);
CREATE INDEX IF NOT EXISTS idx_review_sources_video_id ON review_sources(youtube_video_id);

-- 5. benchmark_results
CREATE TABLE IF NOT EXISTS benchmark_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_source_id UUID NOT NULL REFERENCES review_sources(id) ON DELETE CASCADE,
    benchmark_group TEXT NOT NULL,
    variant TEXT,
    category TEXT NOT NULL CHECK (category IN ('cpu', 'gpu', 'rendering', 'ai', 'storage', 'system', 'productivity')),
    score NUMERIC NOT NULL,
    unit TEXT,
    power_mode TEXT,
    confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_review_source_id ON benchmark_results(review_source_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_category ON benchmark_results(category);

-- 6. gaming_results
CREATE TABLE IF NOT EXISTS gaming_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_source_id UUID NOT NULL REFERENCES review_sources(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    resolution TEXT,
    preset TEXT,
    ray_tracing BOOLEAN,
    upscaling BOOLEAN,
    upscaling_mode TEXT,
    avg_fps NUMERIC CHECK (avg_fps IS NULL OR avg_fps >= 0),
    one_percent_low_fps NUMERIC CHECK (one_percent_low_fps IS NULL OR one_percent_low_fps >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gaming_results_review_source_id ON gaming_results(review_source_id);
CREATE INDEX IF NOT EXISTS idx_gaming_results_game ON gaming_results(game);

-- 7. thermal_results
CREATE TABLE IF NOT EXISTS thermal_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_source_id UUID NOT NULL REFERENCES review_sources(id) ON DELETE CASCADE,
    test_name TEXT NOT NULL,
    duration_minutes NUMERIC CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
    cpu_peak_c NUMERIC,
    cpu_avg_c NUMERIC,
    cpu_peak_power_w NUMERIC CHECK (cpu_peak_power_w IS NULL OR cpu_peak_power_w >= 0),
    cpu_avg_power_w NUMERIC CHECK (cpu_avg_power_w IS NULL OR cpu_avg_power_w >= 0),
    gpu_peak_c NUMERIC,
    gpu_avg_c NUMERIC,
    keyboard_min_c NUMERIC,
    keyboard_max_c NUMERIC,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_thermal_results_review_source_id ON thermal_results(review_source_id);

-- 8. display_results
CREATE TABLE IF NOT EXISTS display_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_source_id UUID NOT NULL UNIQUE REFERENCES review_sources(id) ON DELETE CASCADE,
    brightness_sdr_nits NUMERIC CHECK (brightness_sdr_nits IS NULL OR brightness_sdr_nits >= 0),
    brightness_hdr_nits NUMERIC CHECK (brightness_hdr_nits IS NULL OR brightness_hdr_nits >= 0),
    srgb_percent NUMERIC CHECK (srgb_percent IS NULL OR (srgb_percent >= 0 AND srgb_percent <= 200)),
    dci_p3_percent NUMERIC CHECK (dci_p3_percent IS NULL OR (dci_p3_percent >= 0 AND dci_p3_percent <= 200)),
    adobe_rgb_percent NUMERIC CHECK (adobe_rgb_percent IS NULL OR (adobe_rgb_percent >= 0 AND adobe_rgb_percent <= 200)),
    response_time_ms NUMERIC CHECK (response_time_ms IS NULL OR response_time_ms >= 0),
    g_sync BOOLEAN,
    vrr BOOLEAN,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_display_results_review_source_id ON display_results(review_source_id);

-- 9. battery_results
CREATE TABLE IF NOT EXISTS battery_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_source_id UUID NOT NULL UNIQUE REFERENCES review_sources(id) ON DELETE CASCADE,
    battery_life_hours NUMERIC CHECK (battery_life_hours IS NULL OR battery_life_hours >= 0),
    test_method TEXT,
    brightness_percent NUMERIC CHECK (brightness_percent IS NULL OR (brightness_percent >= 0 AND brightness_percent <= 100)),
    gpu_mode TEXT,
    charging_adapter_w NUMERIC CHECK (charging_adapter_w IS NULL OR charging_adapter_w >= 0),
    zero_to_fifty_min NUMERIC CHECK (zero_to_fifty_min IS NULL OR zero_to_fifty_min >= 0),
    full_charge_min NUMERIC CHECK (full_charge_min IS NULL OR full_charge_min >= 0),
    usb_c_charging_w NUMERIC CHECK (usb_c_charging_w IS NULL OR usb_c_charging_w >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_battery_results_review_source_id ON battery_results(review_source_id);

-- 10. evidence_records (V2 Major Improvement)
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

-- 11. extraction_jobs
CREATE TABLE IF NOT EXISTS extraction_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_url TEXT NOT NULL,
    youtube_video_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'ready_for_review', 'completed', 'failed', 'rejected', 'duplicate')),
    raw_extraction JSONB,
    error_message TEXT,
    review_source_id UUID REFERENCES review_sources(id) ON DELETE SET NULL,
    attempt_count INTEGER DEFAULT 0,
    last_started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    model_used TEXT,
    processing_duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_video_id ON extraction_jobs(youtube_video_id);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status ON extraction_jobs(status);

-- 12. product_listings
CREATE TABLE IF NOT EXISTS product_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    configuration_id UUID NOT NULL REFERENCES configurations(id) ON DELETE CASCADE,
    retailer TEXT NOT NULL CHECK (retailer IN ('amazon', 'flipkart')),
    product_url TEXT NOT NULL,
    image_url TEXT,
    image_source TEXT DEFAULT 'auto' CHECK (image_source IN ('auto', 'manual')),
    price_source TEXT DEFAULT 'auto' CHECK (price_source IN ('auto', 'manual')),
    current_price NUMERIC CHECK (current_price IS NULL OR current_price >= 0),
    currency TEXT DEFAULT 'INR',
    in_stock BOOLEAN,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(configuration_id, retailer)
);
CREATE INDEX IF NOT EXISTS idx_product_listings_config_id ON product_listings(configuration_id);

-- 13. price_history (Append-only)
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES product_listings(id) ON DELETE CASCADE,
    price NUMERIC NOT NULL CHECK (price >= 0),
    checked_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_history_listing_id ON price_history(listing_id);

-- 14. review_audits (V2 Provenance & Audit Trail)
CREATE TABLE IF NOT EXISTS review_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_source_id UUID NOT NULL REFERENCES review_sources(id) ON DELETE CASCADE,
    reviewer_identity TEXT NOT NULL DEFAULT 'admin_reviewer',
    action TEXT NOT NULL CHECK (action IN ('created', 'modified', 'discarded')),
    diff_summary JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_review_audits_review_source_id ON review_audits(review_source_id);

-- Enable Row Level Security (RLS) on all production tables
ALTER TABLE laptop_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE laptops ENABLE ROW LEVEL SECURITY;
ALTER TABLE configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaming_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE thermal_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE display_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE battery_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_audits ENABLE ROW LEVEL SECURITY;

-- Allow public read access to published laptops, configs, benchmarks, and reviews
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Public can view brands" ON laptop_brands;
    CREATE POLICY "Public can view brands" ON laptop_brands FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view laptops" ON laptops;
    CREATE POLICY "Public can view laptops" ON laptops FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view configurations" ON configurations;
    CREATE POLICY "Public can view configurations" ON configurations FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view review sources" ON review_sources;
    CREATE POLICY "Public can view review sources" ON review_sources FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view benchmark results" ON benchmark_results;
    CREATE POLICY "Public can view benchmark results" ON benchmark_results FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view gaming results" ON gaming_results;
    CREATE POLICY "Public can view gaming results" ON gaming_results FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view thermal results" ON thermal_results;
    CREATE POLICY "Public can view thermal results" ON thermal_results FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view display results" ON display_results;
    CREATE POLICY "Public can view display results" ON display_results FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view battery results" ON battery_results;
    CREATE POLICY "Public can view battery results" ON battery_results FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view evidence records" ON evidence_records;
    CREATE POLICY "Public can view evidence records" ON evidence_records FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view product listings" ON product_listings;
    CREATE POLICY "Public can view product listings" ON product_listings FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view price history" ON price_history;
    CREATE POLICY "Public can view price history" ON price_history FOR SELECT USING (true);
END $$;

-- ============================================================
-- ATOMIC COMMIT RPC FUNCTION V2
-- ============================================================
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
    v_result JSONB;
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

    -- 7. Insert Gaming Results with review_source_id
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
        FROM jsonb_array_elements(p_gaming_json);
    END IF;

    -- 8. Insert Thermal Results with review_source_id
    IF p_thermals_json IS NOT NULL AND jsonb_array_length(p_thermals_json) > 0 THEN
        INSERT INTO thermal_results (
            review_source_id, test_name, duration_minutes, cpu_peak_c, cpu_avg_c, cpu_peak_power_w, cpu_avg_power_w, gpu_peak_c, gpu_avg_c, keyboard_min_c, keyboard_max_c, notes
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
        FROM jsonb_array_elements(p_thermals_json);
    END IF;

    -- 9. Insert Display Results with review_source_id
    IF p_display_json IS NOT NULL AND p_display_json::text != 'null' THEN
        INSERT INTO display_results (
            review_source_id, brightness_sdr_nits, brightness_hdr_nits, srgb_percent, dci_p3_percent, adobe_rgb_percent, response_time_ms, g_sync, vrr, notes
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

    -- 10. Insert Battery Results with review_source_id
    IF p_battery_json IS NOT NULL AND p_battery_json::text != 'null' THEN
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

    -- 12. Create Review Audit Trail
    INSERT INTO review_audits (
        review_source_id, reviewer_identity, action, diff_summary
    ) VALUES (
        v_review_id,
        COALESCE(p_reviewer_identity, 'admin_reviewer'),
        'created',
        jsonb_build_object(
            'benchmarks_count', COALESCE(jsonb_array_length(p_benchmarks_json), 0),
            'gaming_count', COALESCE(jsonb_array_length(p_gaming_json), 0),
            'thermals_count', COALESCE(jsonb_array_length(p_thermals_json), 0),
            'evidence_count', COALESCE(jsonb_array_length(p_evidence_json), 0)
        )
    );

    -- 13. Mark extraction job completed
    UPDATE extraction_jobs 
    SET status = 'completed', 
        review_source_id = v_review_id,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_job_id;

    -- Return JSON payload with created identifiers
    v_result := jsonb_build_object(
        'status', 'success',
        'review_source_id', v_review_id,
        'configuration_id', v_config_id,
        'laptop_id', v_laptop_id,
        'brand_id', v_brand_id
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;
