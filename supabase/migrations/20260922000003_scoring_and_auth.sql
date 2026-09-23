-- ==============================================================================
-- AI LAPTOP REVIEW PLATFORM V2 - SCORING SYSTEM & AUTH MIGRATION
-- Migration: 20260922000003_scoring_and_auth.sql
-- Description: Adds user profiles with role-based permissions, benchmark definitions,
-- configurable scoring metrics & profiles, configuration scores, score details,
-- scoring run telemetry, and audit logging.
-- ==============================================================================

-- 1. PROFILES TABLE (Linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'reviewer', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- Auto-provision profile on new auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, role, is_active, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), 'User'),
        'viewer',
        TRUE,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger for updating updated_at on profiles
CREATE OR REPLACE FUNCTION public.set_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_profiles_updated_at();

-- 2. BENCHMARK DEFINITIONS
CREATE TABLE IF NOT EXISTS public.benchmark_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    benchmark_key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    version TEXT,
    variant TEXT,
    category TEXT NOT NULL CHECK (category IN ('cpu', 'gpu', 'rendering', 'ai', 'storage', 'system', 'productivity')),
    unit TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('higher_is_better', 'lower_is_better')),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_definitions_key ON public.benchmark_definitions(benchmark_key);
CREATE INDEX IF NOT EXISTS idx_benchmark_definitions_category ON public.benchmark_definitions(category);

-- Add nullable foreign key from benchmark_results to benchmark_definitions
ALTER TABLE public.benchmark_results
ADD COLUMN IF NOT EXISTS benchmark_definition_id UUID NULL REFERENCES public.benchmark_definitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_benchmark_results_definition_id ON public.benchmark_results(benchmark_definition_id);

-- 3. SCORING METRIC DEFINITIONS
CREATE TABLE IF NOT EXISTS public.scoring_metric_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    domain TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('configuration', 'benchmark', 'gaming', 'thermal', 'display', 'battery')),
    source_key TEXT NOT NULL,
    unit TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('higher_is_better', 'lower_is_better', 'binary', 'custom')),
    normalization_method TEXT NOT NULL CHECK (normalization_method IN ('fixed_range', 'percentile', 'target', 'binary', 'custom')),
    fixed_min NUMERIC,
    fixed_max NUMERIC,
    target_value NUMERIC,
    aggregation_method TEXT NOT NULL CHECK (aggregation_method IN ('mean', 'median', 'best', 'latest', 'max', 'min')),
    comparability_key TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scoring_metric_definitions_key ON public.scoring_metric_definitions(metric_key);
CREATE INDEX IF NOT EXISTS idx_scoring_metric_definitions_domain ON public.scoring_metric_definitions(domain);
CREATE INDEX IF NOT EXISTS idx_scoring_metric_definitions_source_type ON public.scoring_metric_definitions(source_type);

-- 4. SCORING PROFILES (Versioned)
CREATE TABLE IF NOT EXISTS public.scoring_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_key TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    minimum_coverage_percent NUMERIC NOT NULL DEFAULT 50 CHECK (minimum_coverage_percent >= 0 AND minimum_coverage_percent <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_profile_key_version UNIQUE (profile_key, version)
);

CREATE INDEX IF NOT EXISTS idx_scoring_profiles_key ON public.scoring_profiles(profile_key);
CREATE INDEX IF NOT EXISTS idx_scoring_profiles_is_active ON public.scoring_profiles(is_active);

-- 5. SCORING PROFILE METRICS (Weights per profile version)
CREATE TABLE IF NOT EXISTS public.scoring_profile_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.scoring_profiles(id) ON DELETE CASCADE,
    metric_id UUID NOT NULL REFERENCES public.scoring_metric_definitions(id) ON DELETE RESTRICT,
    weight NUMERIC NOT NULL CHECK (weight >= 0),
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    weight_override NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_profile_metric UNIQUE (profile_id, metric_id)
);

CREATE INDEX IF NOT EXISTS idx_scoring_profile_metrics_profile_id ON public.scoring_profile_metrics(profile_id);
CREATE INDEX IF NOT EXISTS idx_scoring_profile_metrics_metric_id ON public.scoring_profile_metrics(metric_id);

-- 6. CONFIGURATION SCORES (Aggregated Score per Configuration & Profile)
CREATE TABLE IF NOT EXISTS public.configuration_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    configuration_id UUID NOT NULL REFERENCES public.configurations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.scoring_profiles(id) ON DELETE RESTRICT,
    score NUMERIC CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    coverage_percent NUMERIC CHECK (coverage_percent IS NULL OR (coverage_percent >= 0 AND coverage_percent <= 100)),
    metrics_used INTEGER NOT NULL DEFAULT 0,
    metrics_available INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('calculated', 'stale', 'insufficient_data', 'error')),
    calculated_at TIMESTAMPTZ,
    calculation_version INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_config_profile UNIQUE (configuration_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_configuration_scores_config_id ON public.configuration_scores(configuration_id);
CREATE INDEX IF NOT EXISTS idx_configuration_scores_profile_id ON public.configuration_scores(profile_id);
CREATE INDEX IF NOT EXISTS idx_configuration_scores_status ON public.configuration_scores(status);
CREATE INDEX IF NOT EXISTS idx_configuration_scores_score ON public.configuration_scores(score DESC);

-- 7. CONFIGURATION SCORE DETAILS (Explainability / Provenance Breakdown)
CREATE TABLE IF NOT EXISTS public.configuration_score_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    configuration_score_id UUID NOT NULL REFERENCES public.configuration_scores(id) ON DELETE CASCADE,
    metric_id UUID NOT NULL REFERENCES public.scoring_metric_definitions(id) ON DELETE RESTRICT,
    raw_value NUMERIC,
    normalized_score NUMERIC CHECK (normalized_score IS NULL OR (normalized_score >= 0 AND normalized_score <= 100)),
    weight NUMERIC NOT NULL,
    weighted_contribution NUMERIC,
    unit TEXT,
    source_type TEXT,
    source_id UUID,
    review_source_id UUID REFERENCES public.review_sources(id) ON DELETE SET NULL,
    comparability_key TEXT,
    eligibility_status TEXT NOT NULL CHECK (eligibility_status IN ('used', 'excluded', 'missing', 'not_comparable', 'invalid')),
    exclusion_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_config_score_details_score_id ON public.configuration_score_details(configuration_score_id);
CREATE INDEX IF NOT EXISTS idx_config_score_details_metric_id ON public.configuration_score_details(metric_id);
CREATE INDEX IF NOT EXISTS idx_config_score_details_review_source ON public.configuration_score_details(review_source_id);

-- 8. SCORING RUNS (Recalculation Telemetry)
CREATE TABLE IF NOT EXISTS public.scoring_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    profile_id UUID REFERENCES public.scoring_profiles(id) ON DELETE SET NULL,
    configuration_id UUID REFERENCES public.configurations(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_scoring_runs_status ON public.scoring_runs(status);
CREATE INDEX IF NOT EXISTS idx_scoring_runs_started_at ON public.scoring_runs(started_at DESC);

-- 9. SCORING AUDIT LOG
CREATE TABLE IF NOT EXISTS public.scoring_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    profile_id UUID REFERENCES public.scoring_profiles(id) ON DELETE SET NULL,
    old_version INTEGER,
    new_version INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scoring_audit_log_created_at ON public.scoring_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scoring_audit_log_profile_id ON public.scoring_audit_log(profile_id);

-- ==============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_profile_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuration_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuration_score_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Public / Viewer read policies
    DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
    CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

    DROP POLICY IF EXISTS "Public can view benchmark definitions" ON public.benchmark_definitions;
    CREATE POLICY "Public can view benchmark definitions" ON public.benchmark_definitions FOR SELECT USING (is_active = true);

    DROP POLICY IF EXISTS "Public can view scoring metric definitions" ON public.scoring_metric_definitions;
    CREATE POLICY "Public can view scoring metric definitions" ON public.scoring_metric_definitions FOR SELECT USING (is_active = true);

    DROP POLICY IF EXISTS "Public can view active scoring profiles" ON public.scoring_profiles;
    CREATE POLICY "Public can view active scoring profiles" ON public.scoring_profiles FOR SELECT USING (is_active = true);

    DROP POLICY IF EXISTS "Public can view scoring profile metrics" ON public.scoring_profile_metrics;
    CREATE POLICY "Public can view scoring profile metrics" ON public.scoring_profile_metrics FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view configuration scores" ON public.configuration_scores;
    CREATE POLICY "Public can view configuration scores" ON public.configuration_scores FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public can view configuration score details" ON public.configuration_score_details;
    CREATE POLICY "Public can view configuration score details" ON public.configuration_score_details FOR SELECT USING (true);
END $$;

-- ==============================================================================
-- INITIAL SEED DATA: Benchmark Definitions & Core Metrics
-- ==============================================================================
INSERT INTO public.benchmark_definitions (benchmark_key, name, version, variant, category, unit, direction, description)
VALUES 
  ('cinebench_r23_multi', 'Cinebench R23 Multi Core', 'R23', 'Multi Core', 'cpu', 'pts', 'higher_is_better', 'CPU rendering multi-threaded performance'),
  ('cinebench_r23_single', 'Cinebench R23 Single Core', 'R23', 'Single Core', 'cpu', 'pts', 'higher_is_better', 'CPU single-threaded burst performance'),
  ('geekbench_6_multi', 'Geekbench 6 Multi Core', 'v6', 'Multi Core', 'cpu', 'pts', 'higher_is_better', 'Cross-platform CPU multi-core benchmark'),
  ('geekbench_6_single', 'Geekbench 6 Single Core', 'v6', 'Single Core', 'cpu', 'pts', 'higher_is_better', 'Cross-platform CPU single-core benchmark'),
  ('3dmark_time_spy_graphics', '3DMark Time Spy Graphics', 'Time Spy', 'Graphics', 'gpu', 'pts', 'higher_is_better', 'DirectX 12 rasterization GPU benchmark'),
  ('3dmark_steel_nomad', '3DMark Steel Nomad', 'Steel Nomad', 'Overall', 'gpu', 'pts', 'higher_is_better', 'Heavy modern rasterization gaming benchmark'),
  ('blender_classroom', 'Blender Classroom Render', 'v4.0', 'Classroom', 'rendering', 'sec', 'lower_is_better', '3D scene render completion duration'),
  ('pcmark_10_productivity', 'PCMark 10 Productivity', 'PCMark 10', 'Productivity', 'productivity', 'pts', 'higher_is_better', 'Office productivity and web workloads')
ON CONFLICT (benchmark_key) DO NOTHING;

INSERT INTO public.scoring_metric_definitions 
(metric_key, name, description, domain, source_type, source_key, unit, direction, normalization_method, fixed_min, fixed_max, aggregation_method)
VALUES
  -- CPU Performance
  ('cpu_multicore_perf', 'CPU Multi-Core Performance', 'Cinebench R23 Multi-Core score', 'CPU', 'benchmark', 'cinebench_r23_multi', 'pts', 'higher_is_better', 'fixed_range', 3000, 35000, 'best'),
  ('cpu_singlecore_perf', 'CPU Single-Core Performance', 'Cinebench R23 Single-Core score', 'CPU', 'benchmark', 'cinebench_r23_single', 'pts', 'higher_is_better', 'fixed_range', 1000, 2400, 'best'),
  
  -- GPU Performance
  ('gpu_synthetic_perf', 'GPU Synthetic Power', '3DMark Time Spy Graphics score', 'GPU', 'benchmark', '3dmark_time_spy_graphics', 'pts', 'higher_is_better', 'fixed_range', 2000, 24000, 'best'),
  ('gpu_tgp_wattage', 'GPU Sustained TGP', 'Target GPU power limit', 'GPU', 'configuration', 'gpu_tgp_w', 'W', 'higher_is_better', 'fixed_range', 35, 175, 'latest'),
  ('gaming_avg_fps', 'Gaming Average FPS', 'Mean FPS across tested games', 'Gaming', 'gaming', 'avg_fps', 'FPS', 'higher_is_better', 'fixed_range', 30, 180, 'mean'),
  ('gaming_low_fps', 'Gaming 1% Low Stability', 'Mean 1% low frame consistency', 'Gaming', 'gaming', 'one_percent_low_fps', 'FPS', 'higher_is_better', 'fixed_range', 20, 120, 'mean'),

  -- Display Quality
  ('display_srgb', 'sRGB Color Coverage', 'Standard color gamut volume percentage', 'Display', 'display', 'srgb_percent', '%', 'higher_is_better', 'fixed_range', 60, 100, 'latest'),
  ('display_dci_p3', 'DCI-P3 Color Gamut', 'Wide color gamut volume percentage', 'Display', 'display', 'dci_p3_percent', '%', 'higher_is_better', 'fixed_range', 50, 100, 'latest'),
  ('display_brightness', 'Display Brightness SDR', 'Peak SDR screen luminance', 'Display', 'display', 'brightness_sdr_nits', 'nits', 'higher_is_better', 'fixed_range', 250, 600, 'latest'),
  ('display_refresh_rate', 'Screen Refresh Rate', 'Display refresh rate in Hertz', 'Display', 'configuration', 'refresh_rate_hz', 'Hz', 'higher_is_better', 'fixed_range', 60, 300, 'latest'),

  -- Battery & Portability
  ('battery_duration', 'Battery Life Duration', 'Real-world video or productivity runtime', 'Battery', 'battery', 'battery_life_hours', 'hrs', 'higher_is_better', 'fixed_range', 3, 16, 'latest'),
  ('battery_capacity', 'Battery Capacity', 'Battery size in watt-hours', 'Battery', 'configuration', 'battery_wh', 'Wh', 'higher_is_better', 'fixed_range', 40, 99.9, 'latest'),
  ('laptop_weight', 'Chassis Portability (Weight)', 'Device weight in kg', 'Portability', 'configuration', 'weight_kg', 'kg', 'lower_is_better', 'fixed_range', 1.0, 3.2, 'latest'),

  -- Memory & Storage
  ('ram_capacity', 'System RAM Capacity', 'System memory size in gigabytes', 'Memory', 'configuration', 'ram_gb', 'GB', 'higher_is_better', 'fixed_range', 8, 64, 'latest'),
  ('storage_capacity', 'Primary Storage Capacity', 'SSD storage size in gigabytes', 'Storage', 'configuration', 'storage_gb', 'GB', 'higher_is_better', 'fixed_range', 256, 4096, 'latest'),

  -- Thermals & Acoustics
  ('cpu_load_temp', 'CPU Load Thermals', 'Peak CPU temperature during stress testing', 'Thermals', 'thermal', 'cpu_peak_c', '°C', 'lower_is_better', 'fixed_range', 65, 100, 'mean'),
  ('gpu_load_temp', 'GPU Load Thermals', 'Peak GPU temperature during stress testing', 'Thermals', 'thermal', 'gpu_peak_c', '°C', 'lower_is_better', 'fixed_range', 60, 90, 'mean')
ON CONFLICT (metric_key) DO NOTHING;

-- 9 USE-CASE SCORING PROFILES
INSERT INTO public.scoring_profiles (profile_key, name, description, version, is_active, minimum_coverage_percent)
VALUES
  ('gaming', 'Gaming', 'Optimized for rasterization, frame rates, 1% lows, GPU TGP, and high refresh displays.', 1, true, 40),
  ('video_editing', 'Video Editing', 'Emphasizes multi-core CPU encoding, GPU acceleration, RAM capacity, and wide-gamut display.', 1, true, 40),
  ('photo_editing', 'Photo Editing', 'Focuses on 100% sRGB / DCI-P3 color fidelity, single-core burst CPU, and display brightness.', 1, true, 40),
  ('rendering_3d', '3D Rendering', 'Prioritizes sustained multi-threaded rendering, high TGP GPU compute, and cool thermals.', 1, true, 40),
  ('programming', 'Programming', 'Balances multi-core compile speeds, ample RAM (16GB+), long battery life, and comfortable weight.', 1, true, 40),
  ('ai_ml', 'AI / ML', 'Demands maximum GPU VRAM/TGP compute, CPU multi-core, and high system memory.', 1, true, 40),
  ('productivity', 'Productivity', 'Prioritizes long battery endurance, lightweight portability, responsive single-core, and clear screen.', 1, true, 40),
  ('streaming', 'Streaming', 'Combines gaming GPU stability with heavy CPU encoding and fast system RAM.', 1, true, 40),
  ('content_creation', 'Content Creation', 'Balanced all-rounder score with high display color gamut, fast CPU/GPU export times, and storage.', 1, true, 40)
ON CONFLICT (profile_key, version) DO NOTHING;

-- Attach Profile Metric Weights
DO $$
DECLARE
  v_gaming_id UUID;
  v_video_id UUID;
  v_photo_id UUID;
  v_render_id UUID;
  v_prog_id UUID;
  v_ai_id UUID;
  v_prod_id UUID;
  v_stream_id UUID;
  v_content_id UUID;

  -- Metrics
  m_cpu_multi UUID;
  m_cpu_single UUID;
  m_gpu_synth UUID;
  m_gpu_tgp UUID;
  m_game_avg UUID;
  m_game_low UUID;
  m_disp_srgb UUID;
  m_disp_p3 UUID;
  m_disp_bright UUID;
  m_disp_hz UUID;
  m_batt_dur UUID;
  m_batt_wh UUID;
  m_weight UUID;
  m_ram UUID;
  m_storage UUID;
  m_cpu_temp UUID;
  m_gpu_temp UUID;
BEGIN
  SELECT id INTO v_gaming_id FROM public.scoring_profiles WHERE profile_key = 'gaming' AND version = 1;
  SELECT id INTO v_video_id FROM public.scoring_profiles WHERE profile_key = 'video_editing' AND version = 1;
  SELECT id INTO v_photo_id FROM public.scoring_profiles WHERE profile_key = 'photo_editing' AND version = 1;
  SELECT id INTO v_render_id FROM public.scoring_profiles WHERE profile_key = 'rendering_3d' AND version = 1;
  SELECT id INTO v_prog_id FROM public.scoring_profiles WHERE profile_key = 'programming' AND version = 1;
  SELECT id INTO v_ai_id FROM public.scoring_profiles WHERE profile_key = 'ai_ml' AND version = 1;
  SELECT id INTO v_prod_id FROM public.scoring_profiles WHERE profile_key = 'productivity' AND version = 1;
  SELECT id INTO v_stream_id FROM public.scoring_profiles WHERE profile_key = 'streaming' AND version = 1;
  SELECT id INTO v_content_id FROM public.scoring_profiles WHERE profile_key = 'content_creation' AND version = 1;

  SELECT id INTO m_cpu_multi FROM public.scoring_metric_definitions WHERE metric_key = 'cpu_multicore_perf';
  SELECT id INTO m_cpu_single FROM public.scoring_metric_definitions WHERE metric_key = 'cpu_singlecore_perf';
  SELECT id INTO m_gpu_synth FROM public.scoring_metric_definitions WHERE metric_key = 'gpu_synthetic_perf';
  SELECT id INTO m_gpu_tgp FROM public.scoring_metric_definitions WHERE metric_key = 'gpu_tgp_wattage';
  SELECT id INTO m_game_avg FROM public.scoring_metric_definitions WHERE metric_key = 'gaming_avg_fps';
  SELECT id INTO m_game_low FROM public.scoring_metric_definitions WHERE metric_key = 'gaming_low_fps';
  SELECT id INTO m_disp_srgb FROM public.scoring_metric_definitions WHERE metric_key = 'display_srgb';
  SELECT id INTO m_disp_p3 FROM public.scoring_metric_definitions WHERE metric_key = 'display_dci_p3';
  SELECT id INTO m_disp_bright FROM public.scoring_metric_definitions WHERE metric_key = 'display_brightness';
  SELECT id INTO m_disp_hz FROM public.scoring_metric_definitions WHERE metric_key = 'display_refresh_rate';
  SELECT id INTO m_batt_dur FROM public.scoring_metric_definitions WHERE metric_key = 'battery_duration';
  SELECT id INTO m_batt_wh FROM public.scoring_metric_definitions WHERE metric_key = 'battery_capacity';
  SELECT id INTO m_weight FROM public.scoring_metric_definitions WHERE metric_key = 'laptop_weight';
  SELECT id INTO m_ram FROM public.scoring_metric_definitions WHERE metric_key = 'ram_capacity';
  SELECT id INTO m_storage FROM public.scoring_metric_definitions WHERE metric_key = 'storage_capacity';
  SELECT id INTO m_cpu_temp FROM public.scoring_metric_definitions WHERE metric_key = 'cpu_load_temp';
  SELECT id INTO m_gpu_temp FROM public.scoring_metric_definitions WHERE metric_key = 'gpu_load_temp';

  -- Gaming Profile Weights
  IF v_gaming_id IS NOT NULL THEN
    INSERT INTO public.scoring_profile_metrics (profile_id, metric_id, weight, is_required) VALUES
      (v_gaming_id, m_game_avg, 35, false),
      (v_gaming_id, m_game_low, 15, false),
      (v_gaming_id, m_gpu_synth, 20, false),
      (v_gaming_id, m_cpu_multi, 10, false),
      (v_gaming_id, m_disp_hz, 10, false),
      (v_gaming_id, m_gpu_temp, 5, false),
      (v_gaming_id, m_ram, 5, false)
    ON CONFLICT (profile_id, metric_id) DO NOTHING;
  END IF;

  -- Video Editing Profile Weights
  IF v_video_id IS NOT NULL THEN
    INSERT INTO public.scoring_profile_metrics (profile_id, metric_id, weight, is_required) VALUES
      (v_video_id, m_cpu_multi, 30, false),
      (v_video_id, m_gpu_synth, 25, false),
      (v_video_id, m_disp_p3, 15, false),
      (v_video_id, m_ram, 15, false),
      (v_video_id, m_storage, 10, false),
      (v_video_id, m_disp_bright, 5, false)
    ON CONFLICT (profile_id, metric_id) DO NOTHING;
  END IF;

  -- Photo Editing Profile Weights
  IF v_photo_id IS NOT NULL THEN
    INSERT INTO public.scoring_profile_metrics (profile_id, metric_id, weight, is_required) VALUES
      (v_photo_id, m_disp_srgb, 30, false),
      (v_photo_id, m_disp_bright, 20, false),
      (v_photo_id, m_cpu_single, 20, false),
      (v_photo_id, m_ram, 15, false),
      (v_photo_id, m_disp_p3, 15, false)
    ON CONFLICT (profile_id, metric_id) DO NOTHING;
  END IF;

  -- 3D Rendering Profile Weights
  IF v_render_id IS NOT NULL THEN
    INSERT INTO public.scoring_profile_metrics (profile_id, metric_id, weight, is_required) VALUES
      (v_render_id, m_cpu_multi, 35, false),
      (v_render_id, m_gpu_synth, 30, false),
      (v_render_id, m_gpu_tgp, 15, false),
      (v_render_id, m_cpu_temp, 10, false),
      (v_render_id, m_ram, 10, false)
    ON CONFLICT (profile_id, metric_id) DO NOTHING;
  END IF;

  -- Programming Profile Weights
  IF v_prog_id IS NOT NULL THEN
    INSERT INTO public.scoring_profile_metrics (profile_id, metric_id, weight, is_required) VALUES
      (v_prog_id, m_cpu_multi, 30, false),
      (v_prog_id, m_ram, 25, false),
      (v_prog_id, m_batt_dur, 20, false),
      (v_prog_id, m_weight, 15, false),
      (v_prog_id, m_storage, 10, false)
    ON CONFLICT (profile_id, metric_id) DO NOTHING;
  END IF;

  -- AI / ML Profile Weights
  IF v_ai_id IS NOT NULL THEN
    INSERT INTO public.scoring_profile_metrics (profile_id, metric_id, weight, is_required) VALUES
      (v_ai_id, m_gpu_synth, 35, false),
      (v_ai_id, m_gpu_tgp, 20, false),
      (v_ai_id, m_ram, 20, false),
      (v_ai_id, m_cpu_multi, 15, false),
      (v_ai_id, m_storage, 10, false)
    ON CONFLICT (profile_id, metric_id) DO NOTHING;
  END IF;

  -- Productivity Profile Weights
  IF v_prod_id IS NOT NULL THEN
    INSERT INTO public.scoring_profile_metrics (profile_id, metric_id, weight, is_required) VALUES
      (v_prod_id, m_batt_dur, 35, false),
      (v_prod_id, m_weight, 25, false),
      (v_prod_id, m_cpu_single, 20, false),
      (v_prod_id, m_disp_bright, 10, false),
      (v_prod_id, m_ram, 10, false)
    ON CONFLICT (profile_id, metric_id) DO NOTHING;
  END IF;

  -- Streaming Profile Weights
  IF v_stream_id IS NOT NULL THEN
    INSERT INTO public.scoring_profile_metrics (profile_id, metric_id, weight, is_required) VALUES
      (v_stream_id, m_game_avg, 30, false),
      (v_stream_id, m_cpu_multi, 25, false),
      (v_stream_id, m_gpu_synth, 20, false),
      (v_stream_id, m_ram, 15, false),
      (v_stream_id, m_game_low, 10, false)
    ON CONFLICT (profile_id, metric_id) DO NOTHING;
  END IF;

  -- Content Creation Profile Weights
  IF v_content_id IS NOT NULL THEN
    INSERT INTO public.scoring_profile_metrics (profile_id, metric_id, weight, is_required) VALUES
      (v_content_id, m_cpu_multi, 25, false),
      (v_content_id, m_disp_p3, 20, false),
      (v_content_id, m_gpu_synth, 20, false),
      (v_content_id, m_ram, 15, false),
      (v_content_id, m_disp_bright, 10, false),
      (v_content_id, m_storage, 10, false)
    ON CONFLICT (profile_id, metric_id) DO NOTHING;
  END IF;

END $$;
