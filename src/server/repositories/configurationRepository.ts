import { getSupabaseClient } from '../external/supabase.ts';
import type { ConfigurationMatchResult, MatchClassification } from '../../shared/types/index.ts';

export async function getConfigurationById(id: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('configurations')
    .select(`
      *,
      laptops!inner(
        id,
        model,
        series,
        generation,
        laptop_brands!inner(id, name)
      ),
      review_sources(
        id,
        youtube_url,
        youtube_video_id,
        title,
        reviewer,
        published_date,
        verdict_summary,
        verdict_score,
        verdict_pros,
        verdict_cons,
        created_at,
        benchmark_results(*),
        gaming_results(*),
        thermal_results(*),
        display_results(*),
        battery_results(*),
        evidence_records(*)
      ),
      product_listings(
        id,
        retailer,
        product_url,
        image_url,
        image_source,
        price_source,
        current_price,
        currency,
        in_stock,
        last_checked_at,
        price_history(id, price, checked_at)
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch configuration: ${error.message}`);
  }

  const laptop = (data as any).laptops;
  const brand = laptop?.laptop_brands;

  return {
    ...data,
    laptop: {
      id: laptop?.id,
      model: laptop?.model,
      series: laptop?.series,
      generation: laptop?.generation,
      brand_id: brand?.id,
      brand_name: brand?.name || 'Unknown',
    },
  };
}

export async function getConfigurationsForCompare(ids: string[]) {
  if (!ids || ids.length === 0) return [];
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('configurations')
    .select(`
      *,
      laptops!inner(
        id,
        model,
        series,
        generation,
        laptop_brands!inner(id, name)
      ),
      review_sources(
        id,
        youtube_url,
        title,
        reviewer,
        verdict_score,
        benchmark_results(*),
        gaming_results(*),
        thermal_results(*),
        display_results(*),
        battery_results(*)
      ),
      product_listings(
        id,
        retailer,
        current_price,
        image_url,
        in_stock
      )
    `)
    .in('id', ids.slice(0, 3));

  if (error) throw new Error(`Failed to fetch configurations for compare: ${error.message}`);
  return (data || []).map((c: any) => ({
    ...c,
    laptop: {
      id: c.laptops?.id,
      model: c.laptops?.model,
      series: c.laptops?.series,
      generation: c.laptops?.generation,
      brand_name: c.laptops?.laptop_brands?.name || 'Unknown',
    },
  }));
}

/**
 * Intelligent Configuration Matching System
 * First matches brand + model + series + generation.
 * Then compares configuration fields.
 * Classifies candidate matches as:
 * - EXACT MATCH
 * - LIKELY MATCH
 * - PARTIAL MATCH
 * - NO MATCH
 */
export async function findMatchingConfigurations(candidate: {
  brand: string;
  model: string;
  series: string | null;
  generation: string | null;
  cpu: string | null;
  gpu: string | null;
  gpu_tgp_w: number | null;
  ram_gb: number | null;
  ram_speed_mt_s: number | null;
  storage_gb: number | null;
  display_size_inch: number | null;
  display_resolution: string | null;
  refresh_rate_hz: number | null;
  battery_wh: number | null;
}): Promise<ConfigurationMatchResult[]> {
  const client = getSupabaseClient();

  // Step 1: Find matching brand
  const { data: brandData } = await client
    .from('laptop_brands')
    .select('id, name')
    .ilike('name', candidate.brand.trim());

  if (!brandData || brandData.length === 0) {
    return [{
      classification: 'NO MATCH',
      confidenceScore: 0,
      matchedConfiguration: null,
      matchedLaptop: null,
      matchedBrand: null,
      matchingReasons: ['Brand not found in database'],
      differingFields: ['brand'],
    }];
  }

  const brand = brandData[0];

  // Step 2: Query laptops for this brand
  const { data: laptopsData, error: laptopError } = await client
    .from('laptops')
    .select(`
      id,
      model,
      series,
      generation,
      configurations(*)
    `)
    .eq('brand_id', brand.id);

  if (laptopError || !laptopsData || laptopsData.length === 0) {
    return [{
      classification: 'NO MATCH',
      confidenceScore: 0,
      matchedConfiguration: null,
      matchedLaptop: null,
      matchedBrand: brand,
      matchingReasons: ['No laptops registered for this brand'],
      differingFields: ['model'],
    }];
  }

  const results: ConfigurationMatchResult[] = [];
  const candModelClean = candidate.model.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const laptop of laptopsData) {
    const lapModelClean = laptop.model.toLowerCase().replace(/[^a-z0-9]/g, '');
    const modelMatches = candModelClean === lapModelClean || lapModelClean.includes(candModelClean) || candModelClean.includes(lapModelClean);

    if (!modelMatches) continue;

    const configs = (laptop.configurations as any[]) || [];
    if (configs.length === 0) {
      // Laptop exists but has no configs yet
      results.push({
        classification: 'PARTIAL MATCH',
        confidenceScore: 40,
        matchedConfiguration: null,
        matchedLaptop: {
          id: laptop.id,
          brand_id: brand.id,
          brand_name: brand.name,
          model: laptop.model,
          series: laptop.series,
          generation: laptop.generation,
        },
        matchedBrand: brand,
        matchingReasons: ['Laptop model matched, but has no existing configurations'],
        differingFields: ['configuration'],
      });
      continue;
    }

    for (const conf of configs) {
      const matchReasons: string[] = ['Brand matched (' + brand.name + ')', 'Model matched (' + laptop.model + ')'];
      const differing: string[] = [];
      let points = 30; // base for brand & model match
      let totalMaxPoints = 30;

      // Series match
      if (candidate.series || laptop.series) {
        totalMaxPoints += 10;
        if (candidate.series && laptop.series && candidate.series.toLowerCase() === laptop.series.toLowerCase()) {
          points += 10;
          matchReasons.push(`Series matched: ${laptop.series}`);
        } else if (candidate.series && laptop.series) {
          differing.push(`Series: candidate=${candidate.series} vs existing=${laptop.series}`);
        }
      }

      // Generation match
      if (candidate.generation || laptop.generation) {
        totalMaxPoints += 10;
        if (candidate.generation && laptop.generation && candidate.generation.toLowerCase() === laptop.generation.toLowerCase()) {
          points += 10;
          matchReasons.push(`Generation matched: ${laptop.generation}`);
        } else if (candidate.generation && laptop.generation) {
          differing.push(`Generation: candidate=${candidate.generation} vs existing=${laptop.generation}`);
        }
      }

      // CPU match
      if (candidate.cpu || conf.cpu) {
        totalMaxPoints += 20;
        if (candidate.cpu && conf.cpu && normalizeHardwareString(candidate.cpu) === normalizeHardwareString(conf.cpu)) {
          points += 20;
          matchReasons.push(`CPU matched: ${conf.cpu}`);
        } else {
          differing.push(`CPU: candidate=${candidate.cpu || 'N/A'} vs existing=${conf.cpu || 'N/A'}`);
        }
      }

      // GPU match
      if (candidate.gpu || conf.gpu) {
        totalMaxPoints += 20;
        if (candidate.gpu && conf.gpu && normalizeHardwareString(candidate.gpu) === normalizeHardwareString(conf.gpu)) {
          points += 20;
          matchReasons.push(`GPU matched: ${conf.gpu}`);
        } else {
          differing.push(`GPU: candidate=${candidate.gpu || 'N/A'} vs existing=${conf.gpu || 'N/A'}`);
        }
      }

      // RAM match
      if (candidate.ram_gb || conf.ram_gb) {
        totalMaxPoints += 10;
        if (candidate.ram_gb && conf.ram_gb && candidate.ram_gb === conf.ram_gb) {
          points += 10;
          matchReasons.push(`RAM matched: ${conf.ram_gb} GB`);
        } else {
          differing.push(`RAM: candidate=${candidate.ram_gb || 'N/A'} vs existing=${conf.ram_gb || 'N/A'}`);
        }
      }

      // Storage match
      if (candidate.storage_gb || conf.storage_gb) {
        totalMaxPoints += 10;
        if (candidate.storage_gb && conf.storage_gb && candidate.storage_gb === conf.storage_gb) {
          points += 10;
          matchReasons.push(`Storage matched: ${conf.storage_gb} GB`);
        } else {
          differing.push(`Storage: candidate=${candidate.storage_gb || 'N/A'} vs existing=${conf.storage_gb || 'N/A'}`);
        }
      }

      // Display match
      if (candidate.display_resolution || conf.display_resolution) {
        totalMaxPoints += 10;
        if (candidate.display_resolution && conf.display_resolution && candidate.display_resolution.toLowerCase() === conf.display_resolution.toLowerCase()) {
          points += 10;
          matchReasons.push(`Display Resolution matched: ${conf.display_resolution}`);
        } else {
          differing.push(`Resolution: candidate=${candidate.display_resolution || 'N/A'} vs existing=${conf.display_resolution || 'N/A'}`);
        }
      }

      const confidenceScore = Math.round((points / totalMaxPoints) * 100);
      let classification: MatchClassification = 'NO MATCH';

      if (confidenceScore >= 95 && differing.length === 0) {
        classification = 'EXACT MATCH';
      } else if (confidenceScore >= 75 && differing.length <= 1) {
        classification = 'LIKELY MATCH';
      } else if (confidenceScore >= 40) {
        classification = 'PARTIAL MATCH';
      }

      results.push({
        classification,
        confidenceScore,
        matchedConfiguration: conf,
        matchedLaptop: {
          id: laptop.id,
          brand_id: brand.id,
          brand_name: brand.name,
          model: laptop.model,
          series: laptop.series,
          generation: laptop.generation,
        },
        matchedBrand: brand,
        matchingReasons: matchReasons,
        differingFields: differing,
      });
    }
  }

  if (results.length === 0) {
    return [{
      classification: 'NO MATCH',
      confidenceScore: 0,
      matchedConfiguration: null,
      matchedLaptop: null,
      matchedBrand: brand,
      matchingReasons: ['No existing configuration matched model identity'],
      differingFields: ['model'],
    }];
  }

  // Sort by highest confidence score first
  return results.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

function normalizeHardwareString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}
