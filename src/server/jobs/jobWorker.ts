import { extractLaptopDataWithGemini } from '../external/gemini.ts';
import { updateJob, getJobById } from '../repositories/jobsRepository.ts';
import { APP_CONFIG } from '../../shared/constants/index.ts';

// Set of jobs currently processing in this process to prevent overlapping execution
const activeProcessingJobIds = new Set<string>();

/**
 * Execute job processing with resilience, bounded retries for transient errors,
 * and status updates in database.
 */
export async function executeExtractionJob(jobId: string): Promise<void> {
  if (activeProcessingJobIds.has(jobId)) {
    console.log(`Job ${jobId} is already actively processing.`);
    return;
  }

  activeProcessingJobIds.add(jobId);

  try {
    const job = await getJobById(jobId);
    if (!job) {
      console.error(`Cannot process non-existent job: ${jobId}`);
      return;
    }

    if (job.status === 'completed' || job.status === 'ready_for_review') {
      console.log(`Job ${jobId} already in terminal/review state: ${job.status}`);
      return;
    }

    // Mark processing
    const attemptCount = (job.attempt_count || 0) + 1;
    await updateJob(jobId, {
      status: 'processing',
      attempt_count: attemptCount,
      last_started_at: new Date().toISOString(),
      error_message: null,
    });

    console.log(`[JobWorker] Starting extraction for job ${jobId} (Attempt ${attemptCount}/${APP_CONFIG.maxExtractionAttempts}) video=${job.youtube_video_id}`);

    // Call Gemini Extraction with job-specified model if present
    const extractionResult = await extractLaptopDataWithGemini(
      job.youtube_url,
      job.youtube_video_id,
      job.model_used || undefined
    );

    // Extraction succeeded -> move to 'ready_for_review'
    await updateJob(jobId, {
      status: 'ready_for_review',
      raw_extraction: extractionResult.payload,
      model_used: extractionResult.modelUsed,
      processing_duration_ms: extractionResult.durationMs,
      error_message: null,
    });

    console.log(`[JobWorker] Job ${jobId} successfully reached ready_for_review in ${extractionResult.durationMs}ms`);
  } catch (err: any) {
    const rawError = err?.message || String(err);
    console.error(`[JobWorker] Job ${jobId} error on execution:`, rawError);

    // Check specifically for Gemini quota limit / rate exhaustion
    const isQuotaExhausted =
      rawError.includes('GEMINI_QUOTA') ||
      rawError.includes('429') ||
      rawError.includes('RESOURCE_EXHAUSTED') ||
      rawError.toLowerCase().includes('quota');

    if (isQuotaExhausted) {
      console.warn(`[JobWorker] Job ${jobId} halted due to quota limit. Failing cleanly without endless retries.`);
      await updateJob(jobId, {
        status: 'failed',
        error_message: 'GEMINI_QUOTA_EXCEEDED: Quota exceeded for the active Gemini model. Switch to an available model (such as gemini-3.1-flash-lite) in the model selector or wait for quota reset.',
      });
      return;
    }

    const isTransient = isTransientError(rawError);
    const job = await getJobById(jobId);
    const attempts = job?.attempt_count || 1;

    if (isTransient && attempts < APP_CONFIG.maxExtractionAttempts) {
      console.log(`[JobWorker] Transient error encountered for job ${jobId}. Scheduling retry (${attempts}/${APP_CONFIG.maxExtractionAttempts})...`);
      await updateJob(jobId, {
        status: 'pending',
        error_message: `Transient error (${rawError}). Will retry automatically.`,
      });

      // Exponential backoff retry (e.g. 3s, 6s)
      const backoffMs = Math.min(10000, 3000 * Math.pow(2, attempts - 1));
      setTimeout(() => {
        executeExtractionJob(jobId).catch(e => console.error(`Retry execution error for ${jobId}:`, e));
      }, backoffMs);
    } else {
      // Non-transient or exhausted attempts -> fail job
      await updateJob(jobId, {
        status: 'failed',
        error_message: sanitizeErrorMessage(rawError),
      });
    }
  } finally {
    activeProcessingJobIds.delete(jobId);
  }
}

function isTransientError(errorMsg: string): boolean {
  const msg = errorMsg.toLowerCase();
  // Note: 429 quota exhaustion is explicitly handled above to prevent endless looping
  return (
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  );
}

function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_KEY]')
    .replace(/https:\/\/[^@\s]+@/g, 'https://[REDACTED]@')
    .slice(0, 300);
}
