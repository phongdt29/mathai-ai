import assert from "node:assert/strict";
import test, { describe } from "node:test";
import mongoose from "mongoose";

import {
  PasswordResetRequestModel,
  type IPasswordResetRequest,
} from "./password-reset-request.model";
import {
  ScheduledJobRunModel,
  type IScheduledJobRun,
} from "./scheduled-job.model";
import { OCRResultModel, type IOCRResult } from "./ocr-result.model";

// ── Helpers ─────────────────────────────────────────────────────────────

function getSchemaPath(model: mongoose.Model<any>, path: string) {
  return model.schema.path(path);
}

function getIndexes(model: mongoose.Model<any>) {
  return model.schema.indexes();
}

// ── password_reset_request ──────────────────────────────────────────────

describe("PasswordResetRequest model", () => {
  test("token_fingerprint has unique constraint", () => {
    const path = getSchemaPath(PasswordResetRequestModel, "token_fingerprint");
    assert.ok(path, "token_fingerprint path should exist");
    assert.equal(
      (path as any).options.unique,
      true,
      "token_fingerprint should be unique"
    );
  });

  test("token_fingerprint is required", () => {
    const path = getSchemaPath(PasswordResetRequestModel, "token_fingerprint");
    assert.equal(
      (path as any).options.required,
      true,
      "token_fingerprint should be required"
    );
  });

  test("email is required, lowercase, and trimmed", () => {
    const path = getSchemaPath(PasswordResetRequestModel, "email");
    assert.ok(path, "email path should exist");
    assert.equal((path as any).options.required, true);
    assert.equal((path as any).options.lowercase, true);
    assert.equal((path as any).options.trim, true);
  });

  test("expires_at is required", () => {
    const path = getSchemaPath(PasswordResetRequestModel, "expires_at");
    assert.ok(path, "expires_at path should exist");
    assert.equal((path as any).options.required, true);
  });

  test("consumed_at defaults to null", () => {
    const path = getSchemaPath(PasswordResetRequestModel, "consumed_at");
    assert.ok(path, "consumed_at path should exist");
    assert.equal((path as any).options.default, null);
  });

  test("has compound index on {email, createdAt}", () => {
    const indexes = getIndexes(PasswordResetRequestModel);
    const emailIndex = indexes.find(
      ([fields]) => fields.email === 1 && fields.createdAt === -1
    );
    assert.ok(emailIndex, "should have index {email:1, createdAt:-1}");
  });

  test("has compound index on {ip, createdAt}", () => {
    const indexes = getIndexes(PasswordResetRequestModel);
    const ipIndex = indexes.find(
      ([fields]) => fields.ip === 1 && fields.createdAt === -1
    );
    assert.ok(ipIndex, "should have index {ip:1, createdAt:-1}");
  });

  test("validation fails when required fields are missing", () => {
    const doc = new PasswordResetRequestModel({});
    const err = doc.validateSync();
    assert.ok(err, "validation should fail");
    assert.ok(err.errors["email"], "email should be required");
    assert.ok(
      err.errors["token_fingerprint"],
      "token_fingerprint should be required"
    );
    assert.ok(err.errors["expires_at"], "expires_at should be required");
  });

  test("validation passes with all required fields", () => {
    const doc = new PasswordResetRequestModel({
      email: "Test@Example.COM",
      token_fingerprint: "abc123sha256hash",
      expires_at: new Date(Date.now() + 30 * 60 * 1000),
    });
    const err = doc.validateSync();
    assert.equal(err, undefined, "validation should pass");
    // email should be lowercased
    assert.equal(doc.email, "test@example.com");
  });
});

// ── scheduled_job_run ───────────────────────────────────────────────────

describe("ScheduledJobRun model", () => {
  test("status only accepts valid enum values", () => {
    const path = getSchemaPath(ScheduledJobRunModel, "status");
    assert.ok(path, "status path should exist");
    const enumValues = (path as any).options.enum;
    assert.deepEqual(
      enumValues.sort(),
      ["failed", "running", "skipped", "succeeded"],
      "status enum should be running|succeeded|failed|skipped"
    );
  });

  test("status rejects invalid values", () => {
    const doc = new ScheduledJobRunModel({
      job_name: "test.job",
      status: "invalid_status",
      started_at: new Date(),
      trigger: "cron",
    });
    const err = doc.validateSync();
    assert.ok(err, "validation should fail for invalid status");
    assert.ok(err.errors["status"], "status error should exist");
  });

  test("trigger only accepts valid enum values", () => {
    const path = getSchemaPath(ScheduledJobRunModel, "trigger");
    assert.ok(path, "trigger path should exist");
    const enumValues = (path as any).options.enum;
    assert.deepEqual(
      enumValues.sort(),
      ["cron", "manual"],
      "trigger enum should be cron|manual"
    );
  });

  test("trigger rejects invalid values", () => {
    const doc = new ScheduledJobRunModel({
      job_name: "test.job",
      status: "running",
      started_at: new Date(),
      trigger: "webhook",
    });
    const err = doc.validateSync();
    assert.ok(err, "validation should fail for invalid trigger");
    assert.ok(err.errors["trigger"], "trigger error should exist");
  });

  test("job_name and started_at are required", () => {
    const doc = new ScheduledJobRunModel({});
    const err = doc.validateSync();
    assert.ok(err, "validation should fail");
    assert.ok(err.errors["job_name"], "job_name should be required");
    assert.ok(err.errors["status"], "status should be required");
    assert.ok(err.errors["started_at"], "started_at should be required");
    assert.ok(err.errors["trigger"], "trigger should be required");
  });

  test("validation passes with valid data", () => {
    const doc = new ScheduledJobRunModel({
      job_name: "attendance.mark_pending_absences",
      status: "succeeded",
      started_at: new Date(),
      finished_at: new Date(),
      duration_ms: 1234,
      trigger: "cron",
      summary: "Processed 10 records",
    });
    const err = doc.validateSync();
    assert.equal(err, undefined, "validation should pass");
  });

  test("has compound index on {job_name, started_at}", () => {
    const indexes = getIndexes(ScheduledJobRunModel);
    const jobIndex = indexes.find(
      ([fields]) => fields.job_name === 1 && fields.started_at === -1
    );
    assert.ok(jobIndex, "should have index {job_name:1, started_at:-1}");
  });
});

// ── ocr_result ──────────────────────────────────────────────────────────

describe("OCRResult model", () => {
  test("confidence has min 0 and max 1 validators", () => {
    const path = getSchemaPath(OCRResultModel, "confidence");
    assert.ok(path, "confidence path should exist");
    assert.equal((path as any).options.min, 0, "confidence min should be 0");
    assert.equal((path as any).options.max, 1, "confidence max should be 1");
  });

  test("confidence rejects value less than 0", () => {
    const doc = new OCRResultModel({
      student_id: new mongoose.Types.ObjectId(),
      storage_key: "solver/2024/01/abc.png",
      storage_url: "https://storage.example.com/solver/2024/01/abc.png",
      sha256: "abcdef1234567890",
      mime_type: "image/png",
      size_bytes: 1024,
      confidence: -0.1,
      status: "parsed",
      expires_at: new Date(Date.now() + 86400000),
    });
    const err = doc.validateSync();
    assert.ok(err, "validation should fail for confidence < 0");
    assert.ok(err.errors["confidence"], "confidence error should exist");
  });

  test("confidence rejects value greater than 1", () => {
    const doc = new OCRResultModel({
      student_id: new mongoose.Types.ObjectId(),
      storage_key: "solver/2024/01/abc.png",
      storage_url: "https://storage.example.com/solver/2024/01/abc.png",
      sha256: "abcdef1234567890",
      mime_type: "image/png",
      size_bytes: 1024,
      confidence: 1.1,
      status: "parsed",
      expires_at: new Date(Date.now() + 86400000),
    });
    const err = doc.validateSync();
    assert.ok(err, "validation should fail for confidence > 1");
    assert.ok(err.errors["confidence"], "confidence error should exist");
  });

  test("confidence accepts boundary value 0", () => {
    const doc = new OCRResultModel({
      student_id: new mongoose.Types.ObjectId(),
      storage_key: "solver/2024/01/abc.png",
      storage_url: "https://storage.example.com/solver/2024/01/abc.png",
      sha256: "abcdef1234567890",
      mime_type: "image/png",
      size_bytes: 1024,
      confidence: 0,
      status: "failed",
      expires_at: new Date(Date.now() + 86400000),
    });
    const err = doc.validateSync();
    assert.equal(err, undefined, "confidence=0 should be valid");
  });

  test("confidence accepts boundary value 1", () => {
    const doc = new OCRResultModel({
      student_id: new mongoose.Types.ObjectId(),
      storage_key: "solver/2024/01/abc.png",
      storage_url: "https://storage.example.com/solver/2024/01/abc.png",
      sha256: "abcdef1234567890",
      mime_type: "image/png",
      size_bytes: 1024,
      confidence: 1,
      status: "parsed",
      expires_at: new Date(Date.now() + 86400000),
    });
    const err = doc.validateSync();
    assert.equal(err, undefined, "confidence=1 should be valid");
  });

  test("confidence accepts mid-range value 0.85", () => {
    const doc = new OCRResultModel({
      student_id: new mongoose.Types.ObjectId(),
      storage_key: "solver/2024/01/abc.png",
      storage_url: "https://storage.example.com/solver/2024/01/abc.png",
      sha256: "abcdef1234567890",
      mime_type: "image/png",
      size_bytes: 1024,
      confidence: 0.85,
      status: "parsed",
      expires_at: new Date(Date.now() + 86400000),
    });
    const err = doc.validateSync();
    assert.equal(err, undefined, "confidence=0.85 should be valid");
  });

  test("status only accepts valid enum values", () => {
    const path = getSchemaPath(OCRResultModel, "status");
    assert.ok(path, "status path should exist");
    const enumValues = (path as any).options.enum;
    assert.deepEqual(
      enumValues.sort(),
      ["failed", "manual_required", "parsed"],
      "status enum should be parsed|manual_required|failed"
    );
  });

  test("status rejects invalid values", () => {
    const doc = new OCRResultModel({
      student_id: new mongoose.Types.ObjectId(),
      storage_key: "solver/2024/01/abc.png",
      storage_url: "https://storage.example.com/solver/2024/01/abc.png",
      sha256: "abcdef1234567890",
      mime_type: "image/png",
      size_bytes: 1024,
      confidence: 0.9,
      status: "invalid_status",
      expires_at: new Date(Date.now() + 86400000),
    });
    const err = doc.validateSync();
    assert.ok(err, "validation should fail for invalid status");
    assert.ok(err.errors["status"], "status error should exist");
  });

  test("TTL index exists on expires_at with expireAfterSeconds=0", () => {
    const indexes = getIndexes(OCRResultModel);
    const ttlIndex = indexes.find(
      ([fields, options]) =>
        fields.expires_at === 1 && (options as any).expireAfterSeconds === 0
    );
    assert.ok(
      ttlIndex,
      "should have TTL index on expires_at with expireAfterSeconds=0"
    );
  });

  test("has index on sha256", () => {
    const indexes = getIndexes(OCRResultModel);
    const sha256Index = indexes.find(([fields]) => fields.sha256 === 1);
    assert.ok(sha256Index, "should have index on sha256");
  });

  test("has compound index on {student_id, createdAt}", () => {
    const indexes = getIndexes(OCRResultModel);
    const studentIndex = indexes.find(
      ([fields]) => fields.student_id === 1 && fields.createdAt === -1
    );
    assert.ok(studentIndex, "should have index {student_id:1, createdAt:-1}");
  });

  test("required fields validation", () => {
    const doc = new OCRResultModel({});
    const err = doc.validateSync();
    assert.ok(err, "validation should fail");
    assert.ok(err.errors["student_id"], "student_id should be required");
    assert.ok(err.errors["storage_key"], "storage_key should be required");
    assert.ok(err.errors["storage_url"], "storage_url should be required");
    assert.ok(err.errors["sha256"], "sha256 should be required");
    assert.ok(err.errors["mime_type"], "mime_type should be required");
    assert.ok(err.errors["size_bytes"], "size_bytes should be required");
    assert.ok(err.errors["confidence"], "confidence should be required");
    assert.ok(err.errors["status"], "status should be required");
    assert.ok(err.errors["expires_at"], "expires_at should be required");
  });
});
