import {
  type ScheduledJobDefinition,
  type ScheduledJobContext,
  type ScheduledJobSummary,
} from "../services/scheduler.service";
import { OCRResultModel, ocrResultRepository } from "../models/ocr-result.model";
import { ocrStorageService } from "../services/ocr-storage.service";

// ══════════════════════════════════════════════════════════════════════════
// Job F: ocr.cleanup_expired
// ══════════════════════════════════════════════════════════════════════════

/**
 * ocr.cleanup_expired
 *
 * Runs daily at 4:00 AM ICT.
 * Finds OCRResult records with expires_at < now, then:
 *   1. Deletes the storage object via ocrStorageService.delete(storage_key)
 *   2. Deletes the DB record
 *
 * Note: MongoDB TTL index also handles expiration, but this job ensures
 * storage objects are cleaned up proactively (TTL only removes DB docs).
 *
 * Per Requirement 3.13.
 */
async function cleanupExpiredHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  // Find all expired OCR results
  const expiredResults = await ocrResultRepository.findExpired();

  if (expiredResults.length === 0) {
    return {
      ok: true,
      metrics: { expired_found: 0, storage_deleted: 0, records_deleted: 0 },
      notes: ["No expired OCR results found"],
    };
  }

  let storageDeleted = 0;
  let storageErrors = 0;
  let recordsDeleted = 0;

  // Collect unique storage keys to avoid deleting the same object multiple times
  // (multiple OCRResult records can share the same storage_key due to deduplication)
  const storageKeysToDelete = new Set<string>();
  const recordIds: string[] = [];

  for (const result of expiredResults) {
    recordIds.push(result._id.toString());
    storageKeysToDelete.add(result.storage_key);
  }

  // Check if any non-expired records still reference the same storage_key
  // before deleting the storage object
  for (const storageKey of storageKeysToDelete) {
    const activeReferences = await OCRResultModel.countDocuments({
      storage_key: storageKey,
      expires_at: { $gte: new Date() },
    }).exec();

    if (activeReferences > 0) {
      // Other non-expired records still reference this storage object — skip deletion
      storageKeysToDelete.delete(storageKey);
    }
  }

  // Delete storage objects
  for (const storageKey of storageKeysToDelete) {
    try {
      await ocrStorageService.delete(storageKey);
      storageDeleted++;
    } catch (err) {
      // Non-blocking: log but continue with DB cleanup
      storageErrors++;
      console.error(
        `[ocr.cleanup_expired] Failed to delete storage object "${storageKey}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Delete DB records
  const deleteResult = await OCRResultModel.deleteMany({
    _id: { $in: recordIds.map((id) => id) },
  }).exec();

  recordsDeleted = deleteResult.deletedCount ?? 0;

  return {
    ok: true,
    metrics: {
      expired_found: expiredResults.length,
      storage_deleted: storageDeleted,
      storage_errors: storageErrors,
      records_deleted: recordsDeleted,
    },
  };
}

// ── Job F Definition ────────────────────────────────────────────────────

export const ocrCleanupExpiredJob: ScheduledJobDefinition = {
  name: "ocr.cleanup_expired",
  cronExpression: "0 4 * * *",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 3_600_000, // 1 hour
  run: cleanupExpiredHandler,
};
