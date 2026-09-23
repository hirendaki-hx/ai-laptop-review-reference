import { AggregationMethod } from '../../../shared/types/index.ts';

export interface MeasurementRecord {
  value: number;
  reviewSourceId?: string;
  sourceId?: string;
  timestampDisplay?: string;
  reviewerName?: string;
  notes?: string;
}

/**
 * Aggregates a list of measurement numbers based on the specified aggregation method.
 */
export function aggregateMeasurements(
  records: MeasurementRecord[],
  method: AggregationMethod
): { aggregatedValue: number; bestRecord?: MeasurementRecord } | null {
  if (!records || records.length === 0) {
    return null;
  }

  const validRecords = records.filter((r) => typeof r.value === 'number' && !isNaN(r.value));
  if (validRecords.length === 0) {
    return null;
  }

  if (method === 'latest') {
    return { aggregatedValue: validRecords[validRecords.length - 1].value, bestRecord: validRecords[validRecords.length - 1] };
  }

  if (method === 'max' || method === 'best') {
    const best = validRecords.reduce((prev, curr) => (curr.value > prev.value ? curr : prev));
    return { aggregatedValue: best.value, bestRecord: best };
  }

  if (method === 'min') {
    const worst = validRecords.reduce((prev, curr) => (curr.value < prev.value ? curr : prev));
    return { aggregatedValue: worst.value, bestRecord: worst };
  }

  if (method === 'median') {
    const sorted = [...validRecords].sort((a, b) => a.value - b.value);
    const mid = Math.floor(sorted.length / 2);
    const medianVal = sorted.length % 2 !== 0 ? sorted[mid].value : (sorted[mid - 1].value + sorted[mid].value) / 2;
    return { aggregatedValue: Math.round(medianVal * 10) / 10, bestRecord: sorted[mid] };
  }

  // Default: Mean (Average)
  const sum = validRecords.reduce((acc, curr) => acc + curr.value, 0);
  const avg = sum / validRecords.length;
  return { aggregatedValue: Math.round(avg * 10) / 10, bestRecord: validRecords[0] };
}
