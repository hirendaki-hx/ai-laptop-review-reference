import { markConfigurationScoresStale } from '../../repositories/configurationScoreRepository.ts';
import { calculateAllScoresForConfiguration } from './scoreCalculator.ts';

/**
 * Handles background score invalidation and recalculation after review commit.
 * Non-blocking: will not throw or break the caller.
 */
export async function triggerScoreRecalculationForConfig(
  configurationId: string
): Promise<void> {
  try {
    // 1. Mark existing scores as stale
    await markConfigurationScoresStale(configurationId);

    // 2. Perform recalculation asynchronously
    calculateAllScoresForConfiguration(configurationId).catch((err) => {
      console.warn(`[ScoreInvalidation] Background recalculation deferred for config ${configurationId}:`, err.message);
    });
  } catch (err: any) {
    console.warn(`[ScoreInvalidation] Error during score invalidation for config ${configurationId}:`, err.message);
  }
}
