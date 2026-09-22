import crypto from 'crypto';
import { getSupabase, isSupabaseConfigured } from './supabase.ts';
import { extractListingData } from './listings.ts';
import {
  ExtractionData,
  ExtractionJob,
  BrandEntity,
  LaptopEntity,
  ConfigurationEntity,
  ConfigurationData,
  ReviewSourceEntity,
  ReviewMeta,
  FullConfigurationReport,
  MatchedEntityInfo,
  BenchmarkItem,
  GamingItem,
  ThermalItem,
  DisplayData,
  BatteryData,
  ProductListingEntity,
  PriceHistoryEntity,
  RetailListingsInput,
  RetailListingStatusResult,
  Retailer,
  ImageSource,
  PriceSource,
  RefreshListingsResult,
} from '../types.ts';

// In-memory store fallback for demo/testing before Supabase credentials are provided
interface MemoryStore {
  brands: BrandEntity[];
  laptops: LaptopEntity[];
  configurations: ConfigurationEntity[];
  review_sources: ReviewSourceEntity[];
  benchmark_results: (BenchmarkItem & { review_source_id: string })[];
  gaming_results: (GamingItem & { review_source_id: string })[];
  thermal_results: (ThermalItem & { review_source_id: string })[];
  display_results: (DisplayData & { id: string; review_source_id: string })[];
  battery_results: (BatteryData & { id: string; review_source_id: string })[];
  extraction_jobs: ExtractionJob[];
  product_listings: ProductListingEntity[];
  price_history: PriceHistoryEntity[];
}

const memoryStore: MemoryStore = {
  brands: [],
  laptops: [],
  configurations: [],
  review_sources: [],
  benchmark_results: [],
  gaming_results: [],
  thermal_results: [],
  display_results: [],
  battery_results: [],
  extraction_jobs: [],
  product_listings: [],
  price_history: [],
};

// Check if review source already exists for this video ID
export async function checkDuplicateReview(youtubeVideoId: string): Promise<{
  exists: boolean;
  existingReviewId?: string;
  existingLaptopName?: string;
  configurationId?: string;
}> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase database client failed to initialize');
    }

    const { data, error } = await supabase
      .from('review_sources')
      .select(`
        id,
        configuration_id,
        configurations (
          id,
          laptops (
            id,
            model,
            series,
            laptop_brands (
              name
            )
          )
        )
      `)
      .eq('youtube_video_id', youtubeVideoId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[DB] Supabase checkDuplicateReview error:', error.message);
      throw new Error(`Database error checking duplicate review: ${error.message}`);
    }

    if (data) {
      const config = data.configurations as any;
      const laptop = config?.laptops as any;
      const brandObj = laptop?.laptop_brands || laptop?.brands;
      const brandName = brandObj?.name || 'Laptop';
      const laptopName = `${brandName} ${laptop?.model || ''} ${laptop?.series || ''}`.trim();
      return {
        exists: true,
        existingReviewId: data.id,
        existingLaptopName: laptopName,
        configurationId: data.configuration_id,
      };
    }

    return { exists: false };
  }

  // Memory fallback only if Supabase is not configured
  const memReview = memoryStore.review_sources.find(
    (r) => r.youtube_video_id === youtubeVideoId
  );
  if (memReview) {
    const config = memoryStore.configurations.find((c) => c.id === memReview.configuration_id);
    const laptop = config ? memoryStore.laptops.find((l) => l.id === config.laptop_id) : null;
    const brand = laptop ? memoryStore.brands.find((b) => b.id === laptop.brand_id) : null;
    const laptopName = `${brand?.name || 'Laptop'} ${laptop?.model || ''} ${laptop?.series || ''}`.trim();
    return {
      exists: true,
      existingReviewId: memReview.id,
      existingLaptopName: laptopName,
      configurationId: memReview.configuration_id,
    };
  }

  return { exists: false };
}

// Extraction Jobs
export async function saveExtractionJob(job: ExtractionJob): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase database client failed to initialize');
    }
    const { error } = await supabase.from('extraction_jobs').upsert({
      id: job.id,
      youtube_url: job.youtube_url,
      youtube_video_id: job.youtube_video_id,
      status: job.status,
      raw_extraction: job.raw_extraction,
      error_message: job.error_message,
      review_source_id: job.review_source_id,
      created_at: job.created_at,
    });
    if (error) {
      console.error('[DB] Supabase saveExtractionJob error:', error.message);
      throw new Error(`Failed to save extraction job to database: ${error.message}`);
    }

    const idx = memoryStore.extraction_jobs.findIndex((j) => j.id === job.id);
    if (idx >= 0) {
      memoryStore.extraction_jobs[idx] = job;
    } else {
      memoryStore.extraction_jobs.unshift(job);
    }
    return;
  }

  // Always keep in memory store as fallback when Supabase is not configured
  const idx = memoryStore.extraction_jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) {
    memoryStore.extraction_jobs[idx] = job;
  } else {
    memoryStore.extraction_jobs.unshift(job);
  }
}

export async function getExtractionJob(jobId: string): Promise<ExtractionJob | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase database client failed to initialize');
    }
    const { data, error } = await supabase
      .from('extraction_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error) {
      console.error('[DB] Supabase getExtractionJob error:', error.message);
      throw new Error(`Failed to get extraction job from database: ${error.message}`);
    }
    return (data as ExtractionJob) || null;
  }

  const job = memoryStore.extraction_jobs.find((j) => j.id === jobId);
  return job || null;
}

export async function listExtractionJobs(limit = 50): Promise<ExtractionJob[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase database client failed to initialize');
    }
    const { data, error } = await supabase
      .from('extraction_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[DB] Supabase listExtractionJobs error:', error.message);
      throw new Error(`Failed to query extraction_jobs: ${error.message}`);
    }

    return (data || []) as ExtractionJob[];
  }

  return memoryStore.extraction_jobs.slice(0, limit);
}

// Delete single extraction job row - ONLY deletes from extraction_jobs
export async function deleteExtractionJob(jobId: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase database client failed to initialize');
    }
    const { error } = await supabase
      .from('extraction_jobs')
      .delete()
      .eq('id', jobId);

    if (error) {
      console.error('[DB] Supabase deleteExtractionJob error:', error.message);
      throw new Error(`Failed to delete extraction job: ${error.message}`);
    }
  }

  const idx = memoryStore.extraction_jobs.findIndex((j) => j.id === jobId);
  if (idx >= 0) {
    memoryStore.extraction_jobs.splice(idx, 1);
  }
  return true;
}

// Clear all extraction job rows - ONLY deletes from extraction_jobs
export async function clearAllExtractionJobs(): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase database client failed to initialize');
    }
    const { error } = await supabase
      .from('extraction_jobs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.error('[DB] Supabase clearAllExtractionJobs error:', error.message);
      throw new Error(`Failed to clear extraction_jobs: ${error.message}`);
    }
  }

  memoryStore.extraction_jobs = [];
  return true;
}

// Entity matching
export async function findMatchingEntities(
  extracted: ExtractionData
): Promise<MatchedEntityInfo> {
  const brandName = (extracted.laptop.brand || '').trim();
  const modelName = (extracted.laptop.model || '').trim();
  const seriesName = (extracted.laptop.series || '').trim();

  let brandMatched: BrandEntity | null = null;
  let laptopMatched: LaptopEntity | null = null;
  let matchedConfiguration: ConfigurationEntity | null = null;
  let isExactMatch = false;

  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase database client failed to initialize');
    }

    // 1. Brand match
    const { data: brands, error: brandErr } = await supabase
      .from('laptop_brands')
      .select('id, name')
      .ilike('name', brandName)
      .limit(1);

    if (brandErr) {
      console.error('[DB] Supabase findMatchingEntities brand query error:', brandErr.message);
      throw new Error(`Database error querying brand: ${brandErr.message}`);
    }

    if (brands && brands.length > 0) {
      brandMatched = brands[0];

      // 2. Laptop match under brand
      let laptopQuery = supabase
        .from('laptops')
        .select('id, brand_id, model, series, generation')
        .eq('brand_id', brandMatched.id)
        .ilike('model', `%${modelName}%`);

      if (seriesName) {
        laptopQuery = laptopQuery.ilike('series', `%${seriesName}%`);
      }

      const { data: laptops, error: lapErr } = await laptopQuery.limit(1);

      if (lapErr) {
        console.error('[DB] Supabase findMatchingEntities laptop query error:', lapErr.message);
        throw new Error(`Database error querying laptop: ${lapErr.message}`);
      }

      if (laptops && laptops.length > 0) {
        laptopMatched = laptops[0];

        // 3. Configurations under laptop
        const { data: configs, error: cfgErr } = await supabase
          .from('configurations')
          .select('*')
          .eq('laptop_id', laptopMatched.id);

        if (cfgErr) {
          console.error('[DB] Supabase findMatchingEntities config query error:', cfgErr.message);
          throw new Error(`Database error querying configurations: ${cfgErr.message}`);
        }

        if (configs && configs.length > 0) {
          // Find closest config match
          const extCpu = (extracted.configuration.cpu || '').toLowerCase().replace(/\s+/g, '');
          const extGpu = (extracted.configuration.gpu || '').toLowerCase().replace(/\s+/g, '');
          const extRam = extracted.configuration.ram_gb;

          for (const cfg of configs) {
            const cfgCpu = (cfg.cpu || '').toLowerCase().replace(/\s+/g, '');
            const cfgGpu = (cfg.gpu || '').toLowerCase().replace(/\s+/g, '');
            const cpuMatch = extCpu && cfgCpu && (extCpu.includes(cfgCpu) || cfgCpu.includes(extCpu));
            const gpuMatch = extGpu && cfgGpu && (extGpu.includes(cfgGpu) || cfgGpu.includes(extGpu));
            const ramMatch = extRam && cfg.ram_gb && extRam === cfg.ram_gb;

            if (cpuMatch && gpuMatch && ramMatch) {
              matchedConfiguration = cfg as ConfigurationEntity;
              isExactMatch = true;
              break;
            } else if ((cpuMatch && gpuMatch) || (cpuMatch && ramMatch)) {
              matchedConfiguration = cfg as ConfigurationEntity;
              isExactMatch = false;
            }
          }
        }
      }
    }

    return {
      brandMatched,
      laptopMatched,
      matchedConfiguration,
      isExactMatch,
    };
  }

  // Memory fallback only when Supabase is not configured
  brandMatched =
    memoryStore.brands.find(
      (b) => b.name.toLowerCase() === brandName.toLowerCase()
    ) || null;

  if (brandMatched) {
    laptopMatched =
      memoryStore.laptops.find(
        (l) =>
          l.brand_id === brandMatched!.id &&
          l.model.toLowerCase().includes(modelName.toLowerCase())
      ) || null;

    if (laptopMatched) {
      const configs = memoryStore.configurations.filter(
        (c) => c.laptop_id === laptopMatched!.id
      );

      const extCpu = (extracted.configuration.cpu || '').toLowerCase().replace(/\s+/g, '');
      const extGpu = (extracted.configuration.gpu || '').toLowerCase().replace(/\s+/g, '');
      const extRam = extracted.configuration.ram_gb;

      for (const cfg of configs) {
        const cfgCpu = (cfg.cpu || '').toLowerCase().replace(/\s+/g, '');
        const cfgGpu = (cfg.gpu || '').toLowerCase().replace(/\s+/g, '');
        const cpuMatch = extCpu && cfgCpu && (extCpu.includes(cfgCpu) || cfgCpu.includes(extCpu));
        const gpuMatch = extGpu && cfgGpu && (extGpu.includes(cfgGpu) || cfgGpu.includes(extGpu));
        const ramMatch = extRam && cfg.ram_gb && extRam === cfg.ram_gb;

        if (cpuMatch && gpuMatch && ramMatch) {
          matchedConfiguration = cfg;
          isExactMatch = true;
          break;
        } else if ((cpuMatch && gpuMatch) || (cpuMatch && ramMatch)) {
          matchedConfiguration = cfg;
          isExactMatch = false;
        }
      }
    }
  }

  return {
    brandMatched,
    laptopMatched,
    matchedConfiguration,
    isExactMatch,
  };
}

// Commit human-confirmed extraction to Supabase Postgres
export async function commitExtractionToDb(
  jobId: string,
  data: ExtractionData,
  options: {
    useExistingConfigId?: string | null;
    retailListings?: RetailListingsInput;
  } = {}
): Promise<{
  laptopId: string;
  configurationId: string;
  reviewSourceId: string;
  listingResults?: RetailListingStatusResult[];
}> {
  const supabase = getSupabase();
  const job = await getExtractionJob(jobId);
  const youtubeUrl = job?.youtube_url || '';
  const youtubeVideoId = job?.youtube_video_id || '';

  if (supabase) {
    let reviewSourceId: string | null = null;
    let configurationId: string | null = options.useExistingConfigId || null;
    let laptopId: string | null = null;

    const { data: rpcData, error: rpcError } = await supabase.rpc('commit_reviewed_extraction', {
      p_job_id: jobId,
      p_brand_name: data.laptop.brand || 'Unknown',
      p_laptop_model: data.laptop.model || 'Unknown',
      p_laptop_series: data.laptop.series || '',
      p_laptop_generation: data.laptop.generation || '',
      p_config_json: data.configuration,
      p_review_json: { ...data.review_meta, youtube_url: youtubeUrl, youtube_video_id: youtubeVideoId, raw_data: { edited_extraction: data } },
      p_benchmarks_json: data.benchmarks || [],
      p_gaming_json: data.gaming || [],
      p_thermals_json: data.thermals || [],
      p_display_json: data.display || null,
      p_battery_json: data.battery || null,
      p_use_existing_config_id: options.useExistingConfigId || null
    });

    if (rpcError) {
      console.error('[Commit] RPC commit_reviewed_extraction failed:', rpcError.message);
      throw new Error(`Database commit failed: ${rpcError.message}`);
    }

    if (!rpcData) {
      throw new Error('Database commit failed: commit_reviewed_extraction RPC returned no review ID.');
    }

    reviewSourceId = rpcData;
    const { data: revData, error: revErr } = await supabase
      .from('review_sources')
      .select('configuration_id, configurations(laptop_id)')
      .eq('id', reviewSourceId)
      .single();

    if (revErr || !revData) {
      throw new Error(`Database commit succeeded but failed to verify created review: ${revErr?.message || 'Record not found'}`);
    }

    configurationId = revData.configuration_id;
    laptopId = (revData.configurations as any)?.laptop_id || null;

    // Also sync job in memory
    if (job) {
      job.status = 'completed';
      job.review_source_id = reviewSourceId;
    }

    // 11. Optional Retail Listings (Amazon / Flipkart) & Price History
    let listingResults: RetailListingStatusResult[] | undefined;
    if (configurationId && options.retailListings) {
      listingResults = await processRetailListings(configurationId, options.retailListings);
    }

    return { laptopId: laptopId || '', configurationId: configurationId || '', reviewSourceId: reviewSourceId!, listingResults };
  }

  // Memory fallback commit
  let brand = memoryStore.brands.find(
    (b) => b.name.toLowerCase() === (data.laptop.brand || '').trim().toLowerCase()
  );
  if (!brand) {
    brand = { id: `b-${crypto.randomUUID().slice(0, 8)}`, name: data.laptop.brand || 'Unknown' };
    memoryStore.brands.push(brand);
  }

  let laptop = memoryStore.laptops.find(
    (l) =>
      l.brand_id === brand!.id &&
      l.model.toLowerCase() === (data.laptop.model || '').trim().toLowerCase()
  );
  if (!laptop) {
    laptop = {
      id: `l-${crypto.randomUUID().slice(0, 8)}`,
      brand_id: brand.id,
      model: data.laptop.model || 'Unknown Model',
      series: data.laptop.series || null,
      generation: data.laptop.generation || null,
    };
    memoryStore.laptops.push(laptop);
  }

  // Re-confirmation check in memory
  let reviewSourceId: string | null = job?.review_source_id || null;
  let configurationId: string | null = options.useExistingConfigId || null;

  if (!reviewSourceId && youtubeVideoId) {
    const existingRev = memoryStore.review_sources.find(
      (r) => r.youtube_video_id === youtubeVideoId
    );
    if (existingRev) {
      reviewSourceId = existingRev.id;
      if (!configurationId) configurationId = existingRev.configuration_id;
    }
  }

  if (reviewSourceId && configurationId) {
    let listingResults: RetailListingStatusResult[] | undefined;
    if (options.retailListings) {
      listingResults = await processRetailListings(configurationId, options.retailListings);
    }
    return { laptopId: laptop.id, configurationId, reviewSourceId, listingResults };
  }

  if (options.useExistingConfigId) {
    configurationId = options.useExistingConfigId;
  } else {
    configurationId = `c-${crypto.randomUUID().slice(0, 8)}`;
    const newConfig: ConfigurationEntity = {
      id: configurationId,
      laptop_id: laptop.id,
      ...data.configuration,
    };
    memoryStore.configurations.push(newConfig);
  }

  reviewSourceId = `r-${crypto.randomUUID().slice(0, 8)}`;
  const reviewEntity: ReviewSourceEntity = {
    id: reviewSourceId,
    configuration_id: configurationId,
    youtube_url: youtubeUrl,
    youtube_video_id: youtubeVideoId,
    title: data.review_meta.title || 'Laptop Review',
    reviewer: data.review_meta.reviewer || 'Unknown Reviewer',
    published_date: data.review_meta.published_date,
    verdict_summary: data.review_meta.verdict_summary,
    verdict_score: data.review_meta.verdict_score,
    verdict_pros: data.review_meta.verdict_pros || [],
    verdict_cons: data.review_meta.verdict_cons || [],
    raw_data: {
      raw_extraction: job?.raw_extraction || undefined,
      edited_extraction: data,
    },
  };
  memoryStore.review_sources.push(reviewEntity);

  // Benchmarks
  if (data.benchmarks) {
    data.benchmarks.forEach((b) => {
      memoryStore.benchmark_results.push({
        id: `bm-${crypto.randomUUID().slice(0, 8)}`,
        review_source_id: reviewSourceId,
        ...b,
      });
    });
  }

  // Gaming
  if (data.gaming) {
    data.gaming.forEach((g) => {
      memoryStore.gaming_results.push({
        id: `gm-${crypto.randomUUID().slice(0, 8)}`,
        review_source_id: reviewSourceId,
        ...g,
      });
    });
  }

  // Thermals
  if (data.thermals) {
    data.thermals.forEach((t) => {
      memoryStore.thermal_results.push({
        id: `th-${crypto.randomUUID().slice(0, 8)}`,
        review_source_id: reviewSourceId,
        ...t,
      });
    });
  }

  // Display
  if (data.display) {
    memoryStore.display_results.push({
      id: `dp-${crypto.randomUUID().slice(0, 8)}`,
      review_source_id: reviewSourceId,
      ...data.display,
    });
  }

  // Battery
  if (data.battery) {
    memoryStore.battery_results.push({
      id: `bt-${crypto.randomUUID().slice(0, 8)}`,
      review_source_id: reviewSourceId,
      ...data.battery,
    });
  }

  if (job) {
    job.status = 'completed';
    job.review_source_id = reviewSourceId;
  }

  // Optional Retail Listings (Amazon / Flipkart) & Price History
  let listingResults: RetailListingStatusResult[] | undefined;
  if (options.retailListings) {
    listingResults = await processRetailListings(configurationId, options.retailListings);
  }

  return {
    laptopId: laptop.id,
    configurationId,
    reviewSourceId,
    listingResults,
  };
}

/**
 * Processes optional retail listings (Amazon / Flipkart) for a configuration:
 * 1. Skips if no retailer URL provided.
 * 2. Scrapes listing data via extractListingData (price, image, inStock).
 * 3. Applies image logic: auto-detected image takes precedence; manual image is fallback only.
 * 4. Upserts into product_listings enforcing (configuration_id, retailer) uniqueness.
 * 5. Appends to price_history only if a price is found and changed since last check.
 * 6. Guarantees non-blocking execution: failures never prevent configuration commit.
 */
export async function processRetailListings(
  configurationId: string,
  retailListings?: RetailListingsInput
): Promise<RetailListingStatusResult[]> {
  if (!retailListings) return [];

  const amazonUrl = retailListings.amazonUrl?.trim();
  const flipkartUrl = retailListings.flipkartUrl?.trim();
  const manualImageUrl = retailListings.manualImageUrl?.trim() || null;

  const tasks: { retailer: Retailer; url: string }[] = [];
  if (amazonUrl) tasks.push({ retailer: 'amazon', url: amazonUrl });
  if (flipkartUrl) tasks.push({ retailer: 'flipkart', url: flipkartUrl });

  if (tasks.length === 0) return [];

  const supabase = getSupabase();
  const results: RetailListingStatusResult[] = [];

  for (const { retailer, url } of tasks) {
    const userManualPrice = retailer === 'amazon'
      ? (retailListings.amazonManualPrice != null && !isNaN(Number(retailListings.amazonManualPrice)) && Number(retailListings.amazonManualPrice) > 0 ? Number(retailListings.amazonManualPrice) : null)
      : (retailListings.flipkartManualPrice != null && !isNaN(Number(retailListings.flipkartManualPrice)) && Number(retailListings.flipkartManualPrice) > 0 ? Number(retailListings.flipkartManualPrice) : null);

    try {
      const extracted = await extractListingData(url, retailer);

      let finalImageUrl: string | null = null;
      let finalImageSource: ImageSource | null = null;

      if (extracted.image) {
        finalImageUrl = extracted.image;
        finalImageSource = 'auto';
      } else if (manualImageUrl) {
        finalImageUrl = manualImageUrl;
        finalImageSource = 'manual';
      }

      let finalPrice: number | null = null;
      let finalPriceSource: PriceSource = 'auto';

      if (extracted.price !== null && extracted.price > 0) {
        finalPrice = extracted.price;
        finalPriceSource = 'auto';
      } else if (userManualPrice !== null) {
        finalPrice = userManualPrice;
        finalPriceSource = 'manual';
      }

      if (supabase) {
        const { data: existingListing } = await supabase
          .from('product_listings')
          .select('id, current_price')
          .eq('configuration_id', configurationId)
          .eq('retailer', retailer)
          .maybeSingle();

        let listingId: string;
        const oldPrice = existingListing?.current_price ?? null;

        if (existingListing) {
          listingId = existingListing.id;
          const updateData: any = {
            product_url: url,
            image_url: finalImageUrl,
            image_source: finalImageSource,
            currency: extracted.currency || 'INR',
            in_stock: extracted.inStock,
            last_checked_at: new Date().toISOString(),
          };
          if (finalPrice !== null) {
            updateData.current_price = finalPrice;
            updateData.price_source = finalPriceSource;
          }
          let { error: updErr } = await supabase
            .from('product_listings')
            .update(updateData)
            .eq('id', listingId);

          if (updErr && (updErr.code === '42703' || updErr.message?.includes('price_source'))) {
            delete updateData.price_source;
            const retryRes = await supabase.from('product_listings').update(updateData).eq('id', listingId);
            updErr = retryRes.error;
          }
          if (updErr) {
            console.warn(`[DB] Warning updating product_listing (${retailer}):`, updErr.message);
          }
        } else {
          const insertData: any = {
            configuration_id: configurationId,
            retailer,
            product_url: url,
            image_url: finalImageUrl,
            image_source: finalImageSource,
            currency: extracted.currency || 'INR',
            in_stock: extracted.inStock,
            last_checked_at: new Date().toISOString(),
          };
          if (finalPrice !== null) {
            insertData.current_price = finalPrice;
            insertData.price_source = finalPriceSource;
          }
          let { data: inserted, error: insErr } = await supabase
            .from('product_listings')
            .insert(insertData)
            .select('id')
            .single();

          if (insErr && (insErr.code === '42703' || insErr.message?.includes('price_source'))) {
            delete insertData.price_source;
            const retryRes = await supabase.from('product_listings').insert(insertData).select('id').single();
            inserted = retryRes.data;
            insErr = retryRes.error;
          }

          if (insErr) {
            console.warn(`[DB] Warning inserting product_listing (${retailer}):`, insErr.message);
            listingId = `pl-${crypto.randomUUID().slice(0, 8)}`;
          } else {
            listingId = inserted.id;
          }
        }

        // Insert into price_history:
        // When manual price is provided and saved: insert one price_history row for it
        // When auto price is detected: insert only if price changed
        if (finalPrice !== null && finalPrice > 0) {
          const priceChanged = oldPrice === null || Number(oldPrice) !== Number(finalPrice);
          const shouldInsert = finalPriceSource === 'manual' || priceChanged;
          if (shouldInsert) {
            const { error: phErr } = await supabase.from('price_history').insert({
              listing_id: listingId,
              price: finalPrice,
              checked_at: new Date().toISOString(),
            });
            if (phErr) {
              console.warn('[DB] Warning inserting price_history:', phErr.message);
            }
          }
        }
      } else {
        // Memory fallback
        let listing = memoryStore.product_listings.find(
          (l) => l.configuration_id === configurationId && l.retailer === retailer
        );
        const oldPrice = listing?.current_price ?? null;

        if (listing) {
          listing.product_url = url;
          listing.image_url = finalImageUrl;
          listing.image_source = finalImageSource;
          if (finalPrice !== null) {
            listing.current_price = finalPrice;
            listing.price_source = finalPriceSource;
          }
          listing.currency = extracted.currency || 'INR';
          listing.in_stock = extracted.inStock;
          listing.last_checked_at = new Date().toISOString();
        } else {
          listing = {
            id: `pl-${crypto.randomUUID().slice(0, 8)}`,
            configuration_id: configurationId,
            retailer,
            product_url: url,
            image_url: finalImageUrl,
            image_source: finalImageSource,
            current_price: finalPrice,
            price_source: finalPriceSource,
            currency: extracted.currency || 'INR',
            in_stock: extracted.inStock,
            last_checked_at: new Date().toISOString(),
          };
          memoryStore.product_listings.push(listing);
        }

        if (finalPrice !== null && finalPrice > 0) {
          const priceChanged = oldPrice === null || Number(oldPrice) !== Number(finalPrice);
          const shouldInsert = finalPriceSource === 'manual' || priceChanged;
          if (shouldInsert) {
            memoryStore.price_history.push({
              id: `ph-${crypto.randomUUID().slice(0, 8)}`,
              listing_id: listing.id,
              price: finalPrice,
              checked_at: new Date().toISOString(),
            });
          }
        }
      }

      results.push({
        retailer,
        productUrl: url,
        status: finalPrice !== null ? 'found' : 'saved_retry',
        price: finalPrice,
        priceSource: finalPrice !== null ? finalPriceSource : null,
        currency: extracted.currency || 'INR',
        imageUrl: finalImageUrl,
        imageSource: finalImageSource,
        inStock: extracted.inStock,
        message:
          finalPrice !== null
            ? (finalPriceSource === 'manual'
                ? `✓ Manual Price Saved — ₹${finalPrice.toLocaleString('en-IN')}`
                : `✓ Found — ₹${finalPrice.toLocaleString('en-IN')}`)
            : "⚠ Couldn't detect price — link saved, will retry",
      });
    } catch (err: any) {
      console.warn(`[DB] Error processing ${retailer} link (${url}):`, err.message || err);
      // Non-blocking fallback: persist raw URL even if scrape threw error
      const finalPrice = userManualPrice;
      const finalPriceSource: PriceSource = userManualPrice !== null ? 'manual' : 'auto';

      try {
        if (supabase) {
          const upsertPayload: any = {
            configuration_id: configurationId,
            retailer,
            product_url: url,
            image_url: manualImageUrl,
            image_source: manualImageUrl ? 'manual' : null,
            last_checked_at: new Date().toISOString(),
          };
          if (finalPrice !== null) {
            upsertPayload.current_price = finalPrice;
            upsertPayload.price_source = finalPriceSource;
          }
          let { data: upsertedData, error: upsertErr } = await supabase.from('product_listings').upsert(
            upsertPayload,
            { onConflict: 'configuration_id,retailer' }
          ).select('id').maybeSingle();

          if (upsertErr && (upsertErr.code === '42703' || upsertErr.message?.includes('price_source'))) {
            delete upsertPayload.price_source;
            const retryRes = await supabase.from('product_listings').upsert(
              upsertPayload,
              { onConflict: 'configuration_id,retailer' }
            ).select('id').maybeSingle();
            upsertedData = retryRes.data;
          }

          if (finalPrice !== null && upsertedData?.id) {
            await supabase.from('price_history').insert({
              listing_id: upsertedData.id,
              price: finalPrice,
              checked_at: new Date().toISOString(),
            });
          }
        }
      } catch (upsertErr) {
        console.warn('[DB] Fallback upsert failed:', upsertErr);
      }

      results.push({
        retailer,
        productUrl: url,
        status: finalPrice !== null ? 'found' : 'saved_retry',
        price: finalPrice,
        priceSource: finalPrice !== null ? finalPriceSource : null,
        currency: 'INR',
        imageUrl: manualImageUrl,
        imageSource: manualImageUrl ? 'manual' : null,
        inStock: null,
        message: finalPrice !== null
          ? `✓ Manual Price Saved — ₹${finalPrice.toLocaleString('en-IN')}`
          : "⚠ Couldn't detect price — link saved, will retry",
      });
    }
  }

  return results;
}

// Discard extraction
export async function discardExtractionJob(jobId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase database client failed to initialize');
    }
    const { error } = await supabase.from('extraction_jobs').update({ status: 'rejected' }).eq('id', jobId);
    if (error) {
      console.error('[DB] Supabase discardExtractionJob error:', error.message);
      throw new Error(`Failed to reject extraction job in database: ${error.message}`);
    }
  }
  const job = memoryStore.extraction_jobs.find((j) => j.id === jobId);
  if (job) {
    job.status = 'rejected';
  }
}

// Fetch Full Configuration Report
export async function getConfigurationReport(
  configurationId: string
): Promise<FullConfigurationReport | null> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      // 1. Fetch config with laptop and brand
      const { data: configData, error: configError } = await supabase
        .from('configurations')
        .select(`
          *,
          laptops (
            *,
            laptop_brands (*)
          )
        `)
        .eq('id', configurationId)
        .maybeSingle();

      if (configError || !configData) {
        console.warn('[DB] Config fetch error in Supabase:', configError?.message);
      } else {
        const laptopData = configData.laptops as any;
        const brandData = (laptopData?.laptop_brands || laptopData?.brands) as BrandEntity;

        // Fetch sibling configurations for this laptop
        const { data: siblingConfigs } = await supabase
          .from('configurations')
          .select('*')
          .eq('laptop_id', laptopData.id);

        // Fetch all review sources for this configuration
        const { data: reviewsData, error: reviewsError } = await supabase
          .from('review_sources')
          .select(`
            *,
            benchmark_results (*),
            gaming_results (*),
            thermal_results (*),
            display_results (*),
            battery_results (*)
          `)
          .eq('configuration_id', configurationId)
          .order('published_date', { ascending: false, nullsFirst: false });

        // Fetch product listings for this configuration
        const { data: listingsData } = await supabase
          .from('product_listings')
          .select('*')
          .eq('configuration_id', configurationId);

        // Fetch price history for those listings
        let priceHistoryData: any[] = [];
        if (listingsData && listingsData.length > 0) {
          const listingIds = listingsData.map((l: any) => l.id);
          const { data: phData } = await supabase
            .from('price_history')
            .select('*')
            .in('listing_id', listingIds)
            .order('checked_at', { ascending: true });
          if (phData) priceHistoryData = phData;
        }

        if (!reviewsError && reviewsData) {
          const reviews: ReviewSourceEntity[] = reviewsData.map((r: any) => {
            const rawExt = r.raw_data?.edited_extraction;
            return {
              id: r.id,
              configuration_id: r.configuration_id,
              youtube_url: r.youtube_url,
              youtube_video_id: r.youtube_video_id,
              reviewer: r.reviewer,
              title: r.title,
              published_date: r.published_date,
              raw_data: r.raw_data || {},
              verdict_summary: r.verdict_summary,
              verdict_score: r.verdict_score,
              verdict_pros: r.verdict_pros || [],
              verdict_cons: r.verdict_cons || [],
              benchmarks: (r.benchmark_results && r.benchmark_results.length > 0) ? r.benchmark_results : (rawExt?.benchmarks || []),
              gaming: (r.gaming_results && r.gaming_results.length > 0) ? r.gaming_results : (rawExt?.gaming || []),
              thermals: (r.thermal_results && r.thermal_results.length > 0) ? r.thermal_results : (rawExt?.thermals || []),
              display: (r.display_results && r.display_results[0]) || rawExt?.display || null,
              battery: (r.battery_results && r.battery_results[0]) || rawExt?.battery || null,
            };
          });

          const { laptops, ...configOnly } = configData;
          const brandObj = brandData || { id: 'unknown', name: 'Unknown' };
          const sibs = (siblingConfigs as ConfigurationEntity[]) || [];
          return {
            configuration: configOnly as ConfigurationEntity,
            laptop: {
              ...laptopData,
              brand: brandObj,
            },
            brand: brandObj,
            reviews,
            siblingConfigurations: sibs,
            allConfigurationsForLaptop: sibs,
            productListings: (listingsData as ProductListingEntity[]) || [],
            priceHistory: (priceHistoryData as PriceHistoryEntity[]) || [],
          };
        }
      }
    } catch (err) {
      console.warn('[DB] Supabase getConfigurationReport failed:', err);
    }
  }

  // Memory fallback only if Supabase not configured or not found
  const config = memoryStore.configurations.find((c) => c.id === configurationId);
  if (!config) return null;

  const laptop = memoryStore.laptops.find((l) => l.id === config.laptop_id);
  if (!laptop) return null;

  const brand = memoryStore.brands.find((b) => b.id === laptop.brand_id) || {
    id: 'unknown',
    name: 'Unknown',
  };

  const reviews = memoryStore.review_sources
    .filter((r) => r.configuration_id === configurationId)
    .map((r) => ({
      ...r,
      benchmarks: memoryStore.benchmark_results.filter((b) => b.review_source_id === r.id),
      gaming: memoryStore.gaming_results.filter((g) => g.review_source_id === r.id),
      thermals: memoryStore.thermal_results.filter((t) => t.review_source_id === r.id),
      display: memoryStore.display_results.find((d) => d.review_source_id === r.id) || null,
      battery: memoryStore.battery_results.find((b) => b.review_source_id === r.id) || null,
    }));

  const siblingConfigs = memoryStore.configurations.filter(
    (c) => c.laptop_id === laptop.id
  );

  const productListings = memoryStore.product_listings.filter(
    (pl) => pl.configuration_id === configurationId
  );
  const listingIds = productListings.map((pl) => pl.id);
  const priceHistory = memoryStore.price_history.filter((ph) => listingIds.includes(ph.listing_id));

  return {
    configuration: config,
    laptop: {
      ...laptop,
      brand,
    },
    brand,
    reviews,
    siblingConfigurations: siblingConfigs,
    allConfigurationsForLaptop: siblingConfigs,
    productListings,
    priceHistory,
  };
}

/**
 * Scheduled / On-demand Refresh for existing product listings.
 * Scrapes prices and images for existing rows in product_listings table.
 * Append-only price_history inserted ONLY when price actually changed.
 */
export async function refreshExistingProductListings(): Promise<RefreshListingsResult> {
  const supabase = getSupabase();
  const details: RefreshListingsResult['details'] = [];
  let updated = 0;
  let priceChangedCount = 0;
  let failed = 0;

  if (supabase) {
    const { data: listings, error } = await supabase
      .from('product_listings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !listings) {
      console.error('[RefreshListings] Failed to query product_listings from Supabase:', error);
      return { total: 0, updated: 0, priceChangedCount: 0, failed: 0, details: [] };
    }

    for (const listing of listings) {
      try {
        const extracted = await extractListingData(listing.product_url, listing.retailer as Retailer);
        const oldPrice = listing.current_price !== null && listing.current_price !== undefined
          ? Number(listing.current_price)
          : null;
        const newPrice = extracted.price;
        const priceDetected = newPrice !== null && newPrice > 0;
        const priceChanged = priceDetected && (oldPrice === null || oldPrice !== newPrice);

        let imageUpdated = false;
        let finalImageUrl = listing.image_url;
        let finalImageSource = listing.image_source;

        if (extracted.image && (listing.image_source !== 'manual' || !listing.image_url)) {
          finalImageUrl = extracted.image;
          finalImageSource = 'auto';
          imageUpdated = true;
        }

        const updateData: any = {
          last_checked_at: new Date().toISOString(),
        };
        if (priceDetected) {
          updateData.current_price = newPrice;
          updateData.price_source = 'auto';
        }
        if (extracted.currency) {
          updateData.currency = extracted.currency;
        }
        if (extracted.inStock !== null) {
          updateData.in_stock = extracted.inStock;
        }
        if (imageUpdated) {
          updateData.image_url = finalImageUrl;
          updateData.image_source = finalImageSource;
        }

        let { error: updErr } = await supabase
          .from('product_listings')
          .update(updateData)
          .eq('id', listing.id);

        if (updErr && (updErr.code === '42703' || updErr.message?.includes('price_source'))) {
          delete updateData.price_source;
          const retryRes = await supabase
            .from('product_listings')
            .update(updateData)
            .eq('id', listing.id);
          updErr = retryRes.error;
        }

        if (updErr) {
          throw updErr;
        }

        // Insert into price_history ONLY if price changed
        if (priceChanged) {
          priceChangedCount++;
          const { error: phErr } = await supabase.from('price_history').insert({
            listing_id: listing.id,
            price: newPrice,
            checked_at: new Date().toISOString(),
          });
          if (phErr) {
            console.warn('[RefreshListings] Failed to insert price_history:', phErr.message);
          }
        }

        updated++;
        details.push({
          id: listing.id,
          configurationId: listing.configuration_id,
          retailer: listing.retailer,
          productUrl: listing.product_url,
          oldPrice,
          newPrice,
          priceChanged,
          imageUpdated,
        });
      } catch (err: any) {
        failed++;
        console.warn(`[RefreshListings] Error refreshing listing ${listing.id}:`, err.message || err);
        details.push({
          id: listing.id,
          configurationId: listing.configuration_id,
          retailer: listing.retailer,
          productUrl: listing.product_url,
          oldPrice: listing.current_price,
          newPrice: null,
          priceChanged: false,
          imageUpdated: false,
          error: err.message || 'Scrape failed',
        });
      }
    }

    return {
      total: listings.length,
      updated,
      priceChangedCount,
      failed,
      details,
    };
  }

  // Memory store fallback
  const listings = memoryStore.product_listings;
  for (const listing of listings) {
    try {
      const extracted = await extractListingData(listing.product_url, listing.retailer);
      const oldPrice = listing.current_price !== null && listing.current_price !== undefined
        ? Number(listing.current_price)
        : null;
      const newPrice = extracted.price;
      const priceDetected = newPrice !== null && newPrice > 0;
      const priceChanged = priceDetected && (oldPrice === null || oldPrice !== newPrice);

      let imageUpdated = false;
      if (extracted.image && (listing.image_source !== 'manual' || !listing.image_url)) {
        listing.image_url = extracted.image;
        listing.image_source = 'auto';
        imageUpdated = true;
      }

      if (priceDetected) {
        listing.current_price = newPrice;
        listing.price_source = 'auto';
      }
      if (extracted.currency) listing.currency = extracted.currency;
      if (extracted.inStock !== null) listing.in_stock = extracted.inStock;
      listing.last_checked_at = new Date().toISOString();

      if (priceChanged) {
        priceChangedCount++;
        memoryStore.price_history.push({
          id: `ph-${crypto.randomUUID().slice(0, 8)}`,
          listing_id: listing.id,
          price: newPrice!,
          checked_at: new Date().toISOString(),
        });
      }

      updated++;
      details.push({
        id: listing.id,
        configurationId: listing.configuration_id,
        retailer: listing.retailer,
        productUrl: listing.product_url,
        oldPrice,
        newPrice,
        priceChanged,
        imageUpdated,
      });
    } catch (err: any) {
      failed++;
      details.push({
        id: listing.id,
        configurationId: listing.configuration_id,
        retailer: listing.retailer,
        productUrl: listing.product_url,
        oldPrice: listing.current_price,
        newPrice: null,
        priceChanged: false,
        imageUpdated: false,
        error: err.message || 'Scrape failed',
      });
    }
  }

  return {
    total: listings.length,
    updated,
    priceChangedCount,
    failed,
    details,
  };
}

// List Laptops (with search query)
export async function listLaptops(searchQuery?: string): Promise<
  Array<{
    laptop: LaptopEntity & { brand: BrandEntity };
    configurationsCount: number;
    reviewsCount: number;
    configurations: ConfigurationEntity[];
  }>
> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      let query = supabase.from('laptops').select(`
        *,
        laptop_brands (*),
        configurations (
          *,
          review_sources (id)
        )
      `);

      const { data, error } = await query;
      if (!error && data) {
        let results = data.map((item: any) => {
          const brand = (item.laptop_brands || item.brands || { id: item.brand_id, name: 'Unknown' }) as BrandEntity;
          const configs = (item.configurations || []) as any[];
          let totalReviews = 0;
          configs.forEach((c) => {
            totalReviews += (c.review_sources || []).length;
          });

          return {
            laptop: {
              id: item.id,
              brand_id: item.brand_id,
              model: item.model,
              series: item.series,
              generation: item.generation,
              brand,
            },
            configurationsCount: configs.length,
            reviewsCount: totalReviews,
            configurations: configs.map((c) => {
              const { review_sources, ...rest } = c;
              return rest as ConfigurationEntity;
            }),
          };
        });

        if (searchQuery && searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          results = results.filter((r) => {
            const matchBrand = r.laptop.brand?.name.toLowerCase().includes(q);
            const matchModel = r.laptop.model.toLowerCase().includes(q);
            const matchSeries = r.laptop.series?.toLowerCase().includes(q);
            const matchConfig = r.configurations.some(
              (c) =>
                c.cpu?.toLowerCase().includes(q) ||
                c.gpu?.toLowerCase().includes(q) ||
                String(c.ram_gb).includes(q)
            );
            return matchBrand || matchModel || matchSeries || matchConfig;
          });
        }

        return results;
      }
    } catch (err) {
      console.warn('[DB] Supabase listLaptops error:', err);
    }
  }

  // Memory fallback
  let results = memoryStore.laptops.map((laptop) => {
    const brand = memoryStore.brands.find((b) => b.id === laptop.brand_id) || {
      id: 'unknown',
      name: 'Unknown',
    };
    const configs = memoryStore.configurations.filter((c) => c.laptop_id === laptop.id);
    let totalReviews = 0;
    configs.forEach((c) => {
      totalReviews += memoryStore.review_sources.filter(
        (r) => r.configuration_id === c.id
      ).length;
    });

    return {
      laptop: {
        ...laptop,
        brand,
      },
      configurationsCount: configs.length,
      reviewsCount: totalReviews,
      configurations: configs,
    };
  });

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    results = results.filter((r) => {
      const matchBrand = r.laptop.brand?.name.toLowerCase().includes(q);
      const matchModel = r.laptop.model.toLowerCase().includes(q);
      const matchSeries = r.laptop.series?.toLowerCase().includes(q);
      const matchConfig = r.configurations.some(
        (c) =>
          c.cpu?.toLowerCase().includes(q) ||
          c.gpu?.toLowerCase().includes(q) ||
          String(c.ram_gb).includes(q)
      );
      return matchBrand || matchModel || matchSeries || matchConfig;
    });
  }

  return results;
}

// Compare 2-3 configurations
export async function getCompareConfigurations(
  configIds: string[]
): Promise<FullConfigurationReport[]> {
  const reports: FullConfigurationReport[] = [];
  for (const id of configIds.slice(0, 3)) {
    const report = await getConfigurationReport(id);
    if (report) {
      reports.push(report);
    }
  }
  return reports;
}

// Helper to clean in-memory store for a review
function cleanMemoryStoreForReview(reviewId: string) {
  for (const job of memoryStore.extraction_jobs) {
    if (job.review_source_id === reviewId) {
      job.review_source_id = null;
    }
  }
  memoryStore.benchmark_results = memoryStore.benchmark_results.filter(
    (b) => b.review_source_id !== reviewId
  );
  memoryStore.gaming_results = memoryStore.gaming_results.filter(
    (g) => g.review_source_id !== reviewId
  );
  memoryStore.thermal_results = memoryStore.thermal_results.filter(
    (t) => t.review_source_id !== reviewId
  );
  memoryStore.display_results = memoryStore.display_results.filter(
    (d) => d.review_source_id !== reviewId
  );
  memoryStore.battery_results = memoryStore.battery_results.filter(
    (b) => b.review_source_id !== reviewId
  );
  memoryStore.review_sources = memoryStore.review_sources.filter(
    (r) => r.id !== reviewId
  );
}

// Helper to clean in-memory store for a laptop
function cleanMemoryStoreForLaptop(laptopId: string, configIds: string[]) {
  const reviews = memoryStore.review_sources.filter((r) =>
    configIds.includes(r.configuration_id)
  );
  for (const r of reviews) {
    cleanMemoryStoreForReview(r.id);
  }

  const listings = memoryStore.product_listings.filter((pl) =>
    configIds.includes(pl.configuration_id)
  );
  const listingIds = listings.map((l) => l.id);

  memoryStore.price_history = memoryStore.price_history.filter(
    (ph) => !listingIds.includes(ph.listing_id)
  );
  memoryStore.product_listings = memoryStore.product_listings.filter(
    (pl) => !configIds.includes(pl.configuration_id)
  );
  memoryStore.configurations = memoryStore.configurations.filter(
    (c) => c.laptop_id !== laptopId
  );
  memoryStore.laptops = memoryStore.laptops.filter((l) => l.id !== laptopId);
}

/**
 * 1. Delete a whole laptop (cascades deepest first):
 * 1. Find all configurations where laptop_id = :id
 * 2. Find all review_sources where configuration_id in that set
 * 3. Delete benchmark_results, gaming_results, thermal_results, display_results, battery_results
 * 4. Delete review_sources rows
 * 5. Delete product_listings (and price_history) for those configurations
 * 6. Delete configurations rows
 * 7. Delete laptops row itself
 */
export async function deleteLaptop(laptopId: string): Promise<{
  success: boolean;
  deletedConfigIds: string[];
}> {
  const supabase = getSupabase();

  if (supabase) {
    // 1. Find configurations where laptop_id = laptopId
    const { data: configs, error: cfgErr } = await supabase
      .from('configurations')
      .select('id')
      .eq('laptop_id', laptopId);

    if (cfgErr) {
      console.error('[DB] Error finding configurations for deleteLaptop:', cfgErr);
      throw new Error(`Failed to find configurations: ${cfgErr.message}`);
    }

    const configIds = (configs || []).map((c) => c.id);

    if (configIds.length > 0) {
      // 2. Find review_sources for these configurations
      const { data: reviews, error: revErr } = await supabase
        .from('review_sources')
        .select('id')
        .in('configuration_id', configIds);

      if (revErr) {
        console.error('[DB] Error finding reviews for deleteLaptop:', revErr);
        throw new Error(`Failed to find reviews: ${revErr.message}`);
      }

      const reviewIds = (reviews || []).map((r) => r.id);

      if (reviewIds.length > 0) {
        // Null out extraction_jobs.review_source_id before deleting review_sources
        // to prevent FK constraint violations while preserving job audit history.
        const { error: jobUpdateErr } = await supabase
          .from('extraction_jobs')
          .update({ review_source_id: null })
          .in('review_source_id', reviewIds);

        if (jobUpdateErr) {
          console.error('[DB] Error nulling extraction_jobs.review_source_id in deleteLaptop:', jobUpdateErr);
          throw new Error(`Failed to update extraction_jobs references: ${jobUpdateErr.message}`);
        }

        // 3. Delete benchmark_results, gaming_results, thermal_results, display_results, battery_results
        await Promise.all([
          supabase.from('benchmark_results').delete().in('review_source_id', reviewIds),
          supabase.from('gaming_results').delete().in('review_source_id', reviewIds),
          supabase.from('thermal_results').delete().in('review_source_id', reviewIds),
          supabase.from('display_results').delete().in('review_source_id', reviewIds),
          supabase.from('battery_results').delete().in('review_source_id', reviewIds),
        ]);

        // 4. Delete review_sources rows
        const { error: delRevErr } = await supabase
          .from('review_sources')
          .delete()
          .in('id', reviewIds);

        if (delRevErr) {
          console.error('[DB] Error deleting review_sources in deleteLaptop:', delRevErr);
          throw new Error(`Failed to delete reviews: ${delRevErr.message}`);
        }
      }

      // 5. Find product_listings where configuration_id in configIds
      const { data: listings } = await supabase
        .from('product_listings')
        .select('id')
        .in('configuration_id', configIds);

      const listingIds = (listings || []).map((l) => l.id);

      if (listingIds.length > 0) {
        await supabase.from('price_history').delete().in('listing_id', listingIds);
        const { error: delListErr } = await supabase
          .from('product_listings')
          .delete()
          .in('id', listingIds);

        if (delListErr) {
          console.error('[DB] Error deleting product_listings in deleteLaptop:', delListErr);
        }
      }

      // 6. Delete configurations rows
      const { error: delCfgErr } = await supabase
        .from('configurations')
        .delete()
        .in('id', configIds);

      if (delCfgErr) {
        console.error('[DB] Error deleting configurations in deleteLaptop:', delCfgErr);
        throw new Error(`Failed to delete configurations: ${delCfgErr.message}`);
      }
    }

    // 7. Delete laptops row itself
    const { error: delLapErr } = await supabase
      .from('laptops')
      .delete()
      .eq('id', laptopId);

    if (delLapErr) {
      console.error('[DB] Error deleting laptop:', delLapErr);
      throw new Error(`Failed to delete laptop: ${delLapErr.message}`);
    }

    cleanMemoryStoreForLaptop(laptopId, configIds);
    return { success: true, deletedConfigIds: configIds };
  }

  // Fallback for memory store
  const configs = memoryStore.configurations.filter((c) => c.laptop_id === laptopId);
  const configIds = configs.map((c) => c.id);
  cleanMemoryStoreForLaptop(laptopId, configIds);
  return { success: true, deletedConfigIds: configIds };
}

/**
 * 2. Delete a single review/video entry:
 * 1. Delete benchmark_results, gaming_results, thermal_results, display_results, battery_results where review_source_id = :id
 * 2. Delete review_sources row itself
 * Does NOT delete the parent configuration or laptop.
 */
export async function deleteReview(reviewId: string): Promise<boolean> {
  const supabase = getSupabase();

  if (supabase) {
    // Null out extraction_jobs.review_source_id before deleting review_source
    // to prevent FK constraint violations while preserving job audit history.
    const { error: jobUpdateErr } = await supabase
      .from('extraction_jobs')
      .update({ review_source_id: null })
      .eq('review_source_id', reviewId);

    if (jobUpdateErr) {
      console.error('[DB] Error nulling extraction_jobs.review_source_id in deleteReview:', jobUpdateErr);
      throw new Error(`Failed to update extraction_jobs reference: ${jobUpdateErr.message}`);
    }

    // 1. Delete child benchmark, gaming, thermal, display, battery results
    await Promise.all([
      supabase.from('benchmark_results').delete().eq('review_source_id', reviewId),
      supabase.from('gaming_results').delete().eq('review_source_id', reviewId),
      supabase.from('thermal_results').delete().eq('review_source_id', reviewId),
      supabase.from('display_results').delete().eq('review_source_id', reviewId),
      supabase.from('battery_results').delete().eq('review_source_id', reviewId),
    ]);

    // 2. Delete review_sources row
    const { error } = await supabase
      .from('review_sources')
      .delete()
      .eq('id', reviewId);

    if (error) {
      console.error('[DB] Error deleting review_source:', error);
      throw new Error(`Failed to delete review: ${error.message}`);
    }
  }

  cleanMemoryStoreForReview(reviewId);
  return true;
}

/**
 * 3. Delete a single retail listing:
 * Deletes one product_listings row (price_history cascades via DB constraint or explicit cleanup).
 */
export async function deleteProductListing(listingId: string): Promise<boolean> {
  const supabase = getSupabase();

  if (supabase) {
    await supabase.from('price_history').delete().eq('listing_id', listingId);
    const { error } = await supabase
      .from('product_listings')
      .delete()
      .eq('id', listingId);

    if (error) {
      console.error('[DB] Error deleting product_listing:', error);
      throw new Error(`Failed to delete listing: ${error.message}`);
    }
  }

  memoryStore.price_history = memoryStore.price_history.filter((ph) => ph.listing_id !== listingId);
  memoryStore.product_listings = memoryStore.product_listings.filter((pl) => pl.id !== listingId);
  return true;
}
