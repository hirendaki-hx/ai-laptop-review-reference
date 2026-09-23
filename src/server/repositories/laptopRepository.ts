import { getSupabaseClient } from '../external/supabase.ts';

export async function getAllBrands(): Promise<Array<{ id: string; name: string }>> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('laptop_brands')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) throw new Error(`Failed to fetch brands: ${error.message}`);
  return data || [];
}

export async function getAllLaptops(options: {
  search?: string;
  brand?: string;
  page?: number;
  limit?: number;
}) {
  const client = getSupabaseClient();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  const buildQuery = (includeCreatedAt: boolean) => {
    let q = client
      .from('laptops')
      .select(`
        id,
        model,
        series,
        generation,
        ${includeCreatedAt ? 'created_at,' : ''}
        laptop_brands!inner(id, name),
        configurations(
          id,
          cpu,
          gpu,
          gpu_tgp_w,
          ram_gb,
          storage_gb,
          display_size_inch,
          display_resolution,
          refresh_rate_hz,
          review_sources(id)
        )
      `, { count: 'exact' });

    if (options.brand) {
      q = q.eq('laptop_brands.name', options.brand);
    }

    if (options.search) {
      const s = options.search.trim();
      q = q.or(`model.ilike.%${s}%,series.ilike.%${s}%,generation.ilike.%${s}%`);
    }

    if (includeCreatedAt) {
      q = q.order('created_at', { ascending: false });
    } else {
      q = q.order('model', { ascending: true });
    }

    return q.range(offset, offset + limit - 1);
  };

  let data: any[] | null = null;
  let count: number | null = null;
  let error: any = null;

  // Try with created_at first (V2 schema)
  const result = await buildQuery(true);
  data = result.data;
  count = result.count;
  error = result.error;

  // If created_at column is missing in schema, fallback to model order while alerting
  if (error && (error.code === 'PGRST204' || error.message?.includes('created_at'))) {
    console.warn('[laptopRepository] Database schema missing laptops.created_at; falling back to model ordering until migration 20260922000002_v2_schema_contract.sql is applied.');
    const fallbackResult = await buildQuery(false);
    data = fallbackResult.data;
    count = fallbackResult.count;
    error = fallbackResult.error;
  }

  if (error) throw new Error(`Failed to fetch laptops: ${error.message}`);

  const formatted = (data || []).map((l: any) => {
    const configs = l.configurations || [];
    const reviewCount = configs.reduce((acc: number, c: any) => acc + (c.review_sources?.length || 0), 0);
    return {
      id: l.id,
      brand_id: l.laptop_brands?.id,
      brand_name: l.laptop_brands?.name || 'Unknown',
      model: l.model,
      series: l.series,
      generation: l.generation,
      created_at: l.created_at,
      configuration_count: configs.length,
      review_count: reviewCount,
      configurations: configs.map((c: any) => ({
        id: c.id,
        cpu: c.cpu,
        gpu: c.gpu,
        gpu_tgp_w: c.gpu_tgp_w,
        ram_gb: c.ram_gb,
        storage_gb: c.storage_gb,
        display_size_inch: c.display_size_inch,
        display_resolution: c.display_resolution,
        refresh_rate_hz: c.refresh_rate_hz,
        review_count: c.review_sources?.length || 0,
      })),
    };
  });

  return {
    laptops: formatted,
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

export async function getLaptopById(id: string) {
  const client = getSupabaseClient();

  const fetchLaptop = (includeCreatedAt: boolean) =>
    client
      .from('laptops')
      .select(`
        id,
        model,
        series,
        generation,
        ${includeCreatedAt ? 'created_at,' : ''}
        laptop_brands(id, name),
        configurations(
          id,
          cpu,
          gpu,
          gpu_tgp_w,
          ram_gb,
          ram_speed_mt_s,
          storage_gb,
          storage_type,
          display_size_inch,
          display_resolution,
          refresh_rate_hz,
          panel_type,
          battery_wh,
          weight_kg,
          thickness_mm,
          created_at,
          review_sources(
            id,
            youtube_url,
            youtube_video_id,
            title,
            reviewer,
            published_date,
            verdict_score,
            verdict_summary
          ),
          product_listings(
            id,
            retailer,
            product_url,
            image_url,
            current_price,
            currency,
            in_stock
          )
        )
      `)
      .eq('id', id)
      .single();

  let { data, error } = await fetchLaptop(true);

  if (error && (error.code === 'PGRST204' || error.message?.includes('created_at'))) {
    const retry = await fetchLaptop(false);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch laptop: ${error.message}`);
  }

  return {
    ...(data as Record<string, any>),
    brand_name: (data as any)?.laptop_brands?.name || 'Unknown',
  };
}

export async function deleteLaptop(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  const { error } = await client.from('laptops').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete laptop: ${error.message}`);
  return true;
}
