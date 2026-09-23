import { getSupabaseClient } from '../external/supabase.ts';
import { BenchmarkDefinition } from '../../shared/types/index.ts';

export async function listBenchmarkDefinitions(): Promise<BenchmarkDefinition[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('benchmark_definitions')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to list benchmark definitions: ${error.message}`);
  }

  return (data || []) as BenchmarkDefinition[];
}

export async function getBenchmarkDefinitionByKey(key: string): Promise<BenchmarkDefinition | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('benchmark_definitions')
    .select('*')
    .eq('benchmark_key', key)
    .single();

  if (error || !data) {
    return null;
  }

  return data as BenchmarkDefinition;
}
