import { ScoringMetricDefinition } from '../../../shared/types/index.ts';
import { MeasurementRecord } from './aggregator.ts';

export function resolveMetricValues(
  configTree: any,
  metric: ScoringMetricDefinition
): MeasurementRecord[] {
  const records: MeasurementRecord[] = [];

  if (!configTree) return records;

  const { source_type, source_key } = metric;

  // 1. Direct Configuration specs
  if (source_type === 'configuration') {
    const rawVal = configTree[source_key];
    if (rawVal !== null && rawVal !== undefined && !isNaN(Number(rawVal))) {
      records.push({
        value: Number(rawVal),
        sourceId: configTree.id,
      });
    }
    return records;
  }

  const reviews = configTree.review_sources || [];

  for (const review of reviews) {
    const reviewSourceId = review.id;
    const reviewerName = review.reviewer;

    // 2. Synthetic & System Benchmarks
    if (source_type === 'benchmark') {
      const benchmarks = review.benchmark_results || [];
      for (const bm of benchmarks) {
        // Match by benchmark_group or custom key
        const groupMatch = bm.benchmark_group?.toLowerCase().trim() === source_key.toLowerCase().trim() ||
                           bm.benchmark_group?.toLowerCase().includes(source_key.toLowerCase()) ||
                           source_key.toLowerCase().includes(bm.benchmark_group?.toLowerCase() || '');
        if (groupMatch && bm.score !== null && bm.score !== undefined) {
          records.push({
            value: Number(bm.score),
            reviewSourceId,
            sourceId: bm.id,
            reviewerName,
            notes: bm.notes,
          });
        }
      }
    }

    // 3. Gaming Results
    if (source_type === 'gaming') {
      const games = review.gaming_results || [];
      for (const game of games) {
        let val: number | null = null;
        if (source_key === 'avg_fps' && game.avg_fps !== null) {
          val = Number(game.avg_fps);
        } else if (source_key === 'one_percent_low_fps' && game.one_percent_low_fps !== null) {
          val = Number(game.one_percent_low_fps);
        }
        if (val !== null && !isNaN(val)) {
          records.push({
            value: val,
            reviewSourceId,
            sourceId: game.id,
            reviewerName,
            notes: `${game.game} (${game.resolution || '1080p'} ${game.preset || 'High'})`,
          });
        }
      }
    }

    // 4. Thermal Results
    if (source_type === 'thermal') {
      const thermals = review.thermal_results || [];
      for (const th of thermals) {
        const val = th[source_key];
        if (val !== null && val !== undefined && !isNaN(Number(val))) {
          records.push({
            value: Number(val),
            reviewSourceId,
            sourceId: th.id,
            reviewerName,
            notes: th.test_name,
          });
        }
      }
    }

    // 5. Display Results
    if (source_type === 'display') {
      const disp = review.display_results;
      if (disp) {
        const val = disp[source_key];
        if (val !== null && val !== undefined && !isNaN(Number(val))) {
          records.push({
            value: Number(val),
            reviewSourceId,
            sourceId: disp.id,
            reviewerName,
            notes: disp.notes,
          });
        }
      }
    }

    // 6. Battery Results
    if (source_type === 'battery') {
      const batt = review.battery_results;
      if (batt) {
        const val = batt[source_key];
        if (val !== null && val !== undefined && !isNaN(Number(val))) {
          records.push({
            value: Number(val),
            reviewSourceId,
            sourceId: batt.id,
            reviewerName,
            notes: batt.test_method,
          });
        }
      }
    }
  }

  return records;
}
