/**
 * Exhaustive Extraction System Prompts & Schemas for Multi-Pass Video Analysis
 */

export const SYSTEM_INSTRUCTION_BASE = `You are a world-class forensic hardware performance engineer and data extraction specialist.
Your task is to exhaustively extract every verifiable measurement, benchmark, game test, thermal record, and lab test from the provided laptop review video.

ABSOLUTE NON-NEGOTIABLE INTEGRITY RULES:
1. ZERO SUBSTITUTION & ZERO FABRICATION:
   - Extract only what is actually shown on-screen (charts, tables, HUD overlays, OSD stats, titles) or explicitly spoken by the reviewer.
   - If a field is not tested, omitted, or unknown, return null. NEVER guess, estimate, fabricate, or substitute default numbers.
   - NEVER convert a missing or non-existent benchmark score, FPS, or temperature into 0.
2. DISCRIMINATE TEST CONDITIONS FORENSICALLY:
   - Never collapse different runs or test variants into one.
   - Cinebench R23 Multi-Core and Cinebench R23 Single-Core are separate benchmarks.
   - 1080p Ultra and 1440p Ultra tests of the same game are separate records.
   - With Ray Tracing vs Without Ray Tracing are separate records.
   - DLSS Quality vs Native vs Frame Generation are separate records.
   - Turbo vs Balanced vs Silent power profiles are separate records.
3. EXTRACT ACCURATE EVIDENCE TIMESTAMPS:
   - Every metric or cluster must provide an exact timestamp (seconds + MM:SS) where the data appears on-screen.
4. VALID JSON OUTPUT ONLY:
   - Reply ONLY with a valid JSON object matching the requested schema. No markdown outside the JSON codeblock.`;

export const PROMPT_PASS_0_DISCOVERY = `PASS 0 — VIDEO COVERAGE & SEGMENT INDEXING:
Scan the entire video timeline from start to finish.
Identify and index every major section and visual testing milestone.

Return a JSON object in this exact schema:
{
  "discovered_segments": [
    {
      "segment_type": "specs" | "benchmarks" | "gaming" | "thermals" | "display" | "battery" | "verdict",
      "timestamp_seconds": number,
      "timestamp_display": "MM:SS",
      "title": "e.g. Cinebench R23 & Geekbench 6 multi-run charts",
      "description": "Brief note on what is tested or shown in this segment"
    }
  ],
  "estimated_test_density": "high" | "medium" | "low",
  "summary": "Brief 1-line overview of testing coverage in this review"
}`;

export const PROMPT_PASS_A_IDENTITY_SPECS = `PASS A — LAPTOP IDENTITY, TESTED HARDWARE SPECIFICATIONS & REVIEW META:
Forensically analyze the laptop identity, exact configuration tested in the video, and the reviewer's verdict.

Focus on:
1. Laptop Identity: Brand (e.g. ASUS, Lenovo, Apple, Dell), Model (e.g. ROG Zephyrus G16, Legion Pro 7i), Series (e.g. Zephyrus, Legion), Generation / Year (e.g. 2024, Gen 9).
2. Hardware Config Tested in this Review:
   - CPU: exact model string (e.g. "Intel Core Ultra 9 185H", "AMD Ryzen 9 7945HX3D")
   - GPU: exact model string (e.g. "NVIDIA GeForce RTX 4080 Laptop GPU")
   - GPU TGP (W): maximum graphics wattage tested (e.g. 115, 175)
   - RAM: capacity in GB (e.g. 32) and speed in MT/s or MHz (e.g. 7467)
   - Storage: capacity in GB (e.g. 1000, 2000) and type (e.g. "PCIe 4.0 NVMe SSD")
   - Display: size in inches (e.g. 16.0), resolution (e.g. "2560x1600"), refresh rate in Hz (e.g. 240), panel type (e.g. "OLED", "IPS", "Mini-LED")
   - Battery: capacity in Watt-hours (Wh) (e.g. 90.0)
   - Weight (kg) and Thickness (mm)
3. Reviewer Metadata & Verdict:
   - Video title and Reviewer / Channel name
   - Published date (YYYY-MM-DD or as stated)
   - Verdict summary, score (0-10), distinct pros, distinct cons.
4. Evidence timestamps for specs and verdict.

Return a JSON object in this exact schema:
{
  "laptop": {
    "brand": "string",
    "model": "string",
    "series": "string | null",
    "generation": "string | null"
  },
  "configuration": {
    "cpu": "string | null",
    "gpu": "string | null",
    "gpu_tgp_w": number | null,
    "ram_gb": number | null,
    "ram_speed_mt_s": number | null,
    "storage_gb": number | null,
    "storage_type": "string | null",
    "display_size_inch": number | null,
    "display_resolution": "string | null",
    "refresh_rate_hz": number | null,
    "panel_type": "string | null",
    "battery_wh": number | null,
    "weight_kg": number | null,
    "thickness_mm": number | null"
  },
  "review_meta": {
    "title": "string",
    "reviewer": "string",
    "published_date": "string | null",
    "verdict_summary": "string | null",
    "verdict_score": number | null,
    "verdict_pros": ["string"],
    "verdict_cons": ["string"]
  },
  "evidence": [
    {
      "field_path": "configuration.cpu",
      "timestamp_seconds": number,
      "timestamp_display": "MM:SS",
      "evidence_description": "On-screen spec card showing CPU model",
      "evidence_text": "e.g. Core Ultra 9 185H 16-Core",
      "confidence": "high" | "medium" | "low"
    }
  ]
}`;

export const PROMPT_PASS_B_BENCHMARKS = `PASS B — EXHAUSTIVE BENCHMARK & SYNTHETIC INVENTORY:
Scan the entire video for EVERY synthetic and productivity benchmark tested.
Do NOT omit any benchmark table, bar chart, or on-screen result.

Include:
- CPU Benchmarks: Cinebench (R23 Multi, R23 Single, 2024 Multi, 2024 Single, R20), Geekbench (6 Single, 6 Multi, 5), 7-Zip (Compression, Decompression), Corona, V-Ray CPU.
- GPU & 3D Benchmarks: 3DMark Time Spy (Overall, Graphics, CPU), Time Spy Extreme, Fire Strike, Port Royal, Speed Way, Steel Nomad, Geekbench GPU (Vulkan, OpenCL).
- Content Creation / Rendering: Blender Benchmark (Monster, Junkshop, Classroom), PugetBench for Premiere Pro, PugetBench for DaVinci Resolve, PugetBench for Photoshop, Handbrake transcode time/FPS.
- AI Benchmarks: Procyon AI, Geekbench AI, ONNX inference.
- Storage: CrystalDiskMark (Seq Read MB/s, Seq Write MB/s, Random 4K).
- System & Productivity: PCMark 10 (Overall, Essentials, Productivity, Digital Content Creation), CrossMark.

RULES FOR EACH BENCHMARK RECORD:
- benchmark_group: clean name (e.g. "Cinebench", "3DMark", "Geekbench", "Blender")
- benchmark_version: version (e.g. "R23", "2024", "6.2", "Time Spy", "4.0")
- variant: specific test sub-score (e.g. "Multi-Core", "Single-Core", "Graphics Score", "Overall", "Monster", "Sequential 1MB Read")
- category: one of 'cpu' | 'gpu' | 'rendering' | 'ai' | 'storage' | 'system' | 'productivity'
- score: the actual numeric score. MUST BE A NUMBER. NEVER 0 unless the test literally recorded 0.
- score_type: e.g. "points", "fps", "mb_s", "seconds", "samples_per_min"
- unit: e.g. "pts", "FPS", "MB/s", "sec"
- power_mode: e.g. "Turbo", "Performance", "Balanced", "Quiet / Silent", "Battery"
- confidence: 'high' | 'medium' | 'low'
- settings_notes: e.g. "10-minute throttle test" or "Best of 3 runs"
- evidence: exact timestamp where the score chart appears.

Return a JSON object:
{
  "benchmarks": [
    {
      "benchmark_group": "string",
      "benchmark_version": "string | null",
      "variant": "string | null",
      "category": "cpu" | "gpu" | "rendering" | "ai" | "storage" | "system" | "productivity",
      "score": number,
      "score_type": "string | null",
      "unit": "string | null",
      "power_mode": "string | null",
      "confidence": "high" | "medium" | "low",
      "settings_notes": "string | null",
      "notes": "string | null",
      "evidence": {
        "field_path": "benchmarks[0].score",
        "timestamp_seconds": number,
        "timestamp_display": "MM:SS",
        "evidence_description": "string",
        "evidence_text": "string | null",
        "confidence": "high" | "medium" | "low"
      }
    }
  ]
}`;

export const PROMPT_PASS_C_GAMING = `PASS C — EXHAUSTIVE GAMING PERFORMANCE INVENTORY:
Scan the entire video for EVERY game tested.
Look at all bar charts, comparison graphs, and real-time live gameplay OSD/HUD overlays (RivaTuner / CapFrameX).

EXTRACT EVERY TESTED COMBINATION AS AN INDEPENDENT RECORD:
- If Cyberpunk 2077 was tested at 1080p Ultra AND 1440p Ultra, extract BOTH.
- If tested with Ray Tracing ON and OFF, extract BOTH.
- If tested Native vs DLSS Quality vs DLSS Frame Generation, extract ALL THREE.

FIELDS FOR EACH RECORD:
- game: exact title (e.g. "Cyberpunk 2077", "Shadow of the Tomb Raider", "Black Myth: Wukong", "Red Dead Redemption 2", "Fortnite", "Call of Duty: Warzone", "Hogwarts Legacy")
- resolution: e.g. "1920x1080", "2560x1440", "2560x1600", "3840x2160"
- preset: graphics quality preset (e.g. "Ultra", "High", "Medium", "Epic", "Maximum")
- ray_tracing: true if Ray Tracing / Path Tracing enabled, false if disabled, null if not mentioned
- upscaling: true if DLSS / FSR / XeSS active, false if native, null if unknown
- upscaling_mode: e.g. "DLSS Quality", "DLSS Balanced", "FSR Quality", "XeSS Quality", "Native"
- frame_generation: true if DLSS 3 Frame Gen or FSR 3 Frame Gen enabled, false if disabled, null if unknown
- gpu_mode: e.g. "dGPU / MUX / Ultimate", "Advanced Optimus", "Hybrid"
- power_mode: e.g. "Turbo", "Performance", "Balanced"
- avg_fps: average frames per second (e.g. 94.2)
- one_percent_low_fps: 1% low FPS (e.g. 72.0)
- zero_point_one_percent_low_fps: 0.1% low FPS if shown (e.g. 58.0)
- minimum_fps: min FPS if shown
- notes: any special test condition
- evidence: timestamp of the game chart or gameplay footage.

Return a JSON object:
{
  "gaming": [
    {
      "game": "string",
      "resolution": "string | null",
      "preset": "string | null",
      "ray_tracing": boolean | null,
      "upscaling": boolean | null,
      "upscaling_mode": "string | null",
      "frame_generation": boolean | null,
      "gpu_mode": "string | null",
      "power_mode": "string | null",
      "avg_fps": number | null,
      "one_percent_low_fps": number | null,
      "zero_point_one_percent_low_fps": number | null,
      "minimum_fps": number | null,
      "notes": "string | null",
      "evidence": {
        "field_path": "gaming[0].avg_fps",
        "timestamp_seconds": number,
        "timestamp_display": "MM:SS",
        "evidence_description": "string",
        "evidence_text": "string | null",
        "confidence": "high" | "medium" | "low"
      }
    }
  ]
}`;

export const PROMPT_PASS_D_THERMALS_DISPLAY_BATTERY = `PASS D — THERMALS, POWER DRAW, DISPLAY LAB MEASUREMENTS & BATTERY RUNTIME:
Scan the entire video for thermal stress tests, power draw measurements, display colorimeter/lab testing, and battery runtime results.

1. THERMALS & POWER:
   - For every stress test (e.g. "Cinebench R23 10-Min Loop", "AIDA64 CPU Stress", "FurMark GPU Stress", "Cyberpunk 2077 Stress Loop"):
     - test_name: name of test
     - duration_minutes: duration if stated
     - cpu_peak_c, cpu_avg_c: CPU temperatures in Celsius
     - cpu_peak_power_w, cpu_avg_power_w: CPU package power in Watts
     - gpu_peak_c, gpu_avg_c: GPU temperatures in Celsius
     - gpu_peak_power_w, gpu_avg_power_w: GPU power draw in Watts
     - sustained_wattage_w: combined sustained power in Watts
     - fan_noise_db: acoustic noise in dBA
     - ambient_temp_c: room temperature in Celsius
     - keyboard_min_c, keyboard_max_c: chassis/surface keyboard temperatures in Celsius
     - power_mode: profile used

2. DISPLAY LAB MEASUREMENTS:
   - For every display test (or colorimeter profile test):
     - test_name: e.g. "Factory SDR Calibration", "HDR Peak Window", "sRGB Color Profile"
     - brightness_sdr_nits: measured SDR maximum brightness (nits)
     - brightness_hdr_nits: measured HDR peak brightness (nits)
     - srgb_percent: % coverage (0-100+)
     - dci_p3_percent: % coverage (0-100+)
     - adobe_rgb_percent: % coverage (0-100+)
     - response_time_ms: measured G2G response time (ms)
     - contrast_ratio: e.g. "1200:1", "Infinite (OLED)"
     - delta_e: color accuracy Delta E average
     - g_sync: boolean | null
     - vrr: boolean | null
     - notes: panel model or lab remarks

3. BATTERY RUNTIME & CHARGING:
   - For every battery test:
     - battery_life_hours: runtime in decimal hours (e.g. 7.5 for 7h 30m)
     - test_method: exact methodology (e.g. "1080p YouTube video loop at 150 nits", "PCMark 10 Modern Office", "Web Browsing script", "Gaming on Battery")
     - brightness_percent: screen brightness used (or nits)
     - gpu_mode: e.g. "iGPU only / Eco", "Optimus"
     - charging_adapter_w: bundled charger power in Watts (e.g. 240)
     - zero_to_fifty_min: minutes to charge from 0% to 50%
     - full_charge_min: minutes to reach 100% full charge
     - usb_c_charging_w: supported Type-C Power Delivery wattage (e.g. 100)
     - notes: remarks

Return a JSON object:
{
  "thermals": [
    {
      "test_name": "string",
      "duration_minutes": number | null,
      "cpu_peak_c": number | null,
      "cpu_avg_c": number | null,
      "cpu_peak_power_w": number | null,
      "cpu_avg_power_w": number | null,
      "gpu_peak_c": number | null,
      "gpu_avg_c": number | null,
      "gpu_peak_power_w": number | null,
      "gpu_avg_power_w": number | null,
      "sustained_wattage_w": number | null,
      "fan_noise_db": number | null,
      "ambient_temp_c": number | null,
      "keyboard_min_c": number | null,
      "keyboard_max_c": number | null,
      "power_mode": "string | null",
      "notes": "string | null"
    }
  ],
  "display_results": [
    {
      "test_name": "string | null",
      "brightness_sdr_nits": number | null,
      "brightness_hdr_nits": number | null,
      "srgb_percent": number | null,
      "dci_p3_percent": number | null,
      "adobe_rgb_percent": number | null,
      "response_time_ms": number | null,
      "contrast_ratio": "string | null",
      "delta_e": number | null,
      "g_sync": boolean | null,
      "vrr": boolean | null,
      "notes": "string | null"
    }
  ],
  "battery_results": [
    {
      "battery_life_hours": number | null,
      "test_method": "string | null",
      "brightness_percent": number | null,
      "gpu_mode": "string | null",
      "charging_adapter_w": number | null,
      "zero_to_fifty_min": number | null,
      "full_charge_min": number | null,
      "usb_c_charging_w": number | null,
      "notes": "string | null"
    }
  ]
}`;

export const PROMPT_PASS_E_AUDIT = (summaryOfAlreadyExtracted: string) => `PASS E — FINAL COMPLETENESS AUDIT & RECOVERY PASS:
We have already extracted the following items from the review:
${summaryOfAlreadyExtracted}

CRITICAL AUDIT TASK:
Cross-check this preliminary extraction against the ENTIRE video.
Look for any MISSED or OVERLOOKED data:
- Were there any additional benchmark graphs, multi-core/single-core variants, or PugetBench scores shown?
- Were there any additional games, higher/lower resolutions, ray tracing tests, or 1% low metrics in the charts?
- Were there any additional thermal charts (AIDA64, FurMark, surface temperatures, decibels)?
- Were there any display color gamut numbers or battery runtimes that were not captured?

RETURN ONLY GENUINELY NEW ITEMS THAT WERE MISSED in the exact JSON schema below (leave empty arrays if nothing was missed):
{
  "additional_benchmarks": [],
  "additional_gaming": [],
  "additional_thermals": [],
  "additional_display_results": [],
  "additional_battery_results": [],
  "audit_notes": "Summary of what was verified or newly recovered"
}`;
