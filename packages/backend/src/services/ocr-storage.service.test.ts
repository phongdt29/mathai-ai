import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import {
  LocalDiskOCRStorage,
  S3OCRStorage,
  type ObjectPutInput,
} from "./ocr-storage.service";

describe("OCRStorageService", () => {
  describe("LocalDiskOCRStorage", () => {
    let tmpDir: string;
    let storage: LocalDiskOCRStorage;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-storage-test-"));
      storage = new LocalDiskOCRStorage(tmpDir);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should store an image and return correct metadata", async () => {
      const buffer = Buffer.from("fake-image-data");
      const input: ObjectPutInput = {
        buffer,
        mimeType: "image/png",
        scope: "solver",
      };

      const result = await storage.putImage(input);

      const expectedSha256 = crypto
        .createHash("sha256")
        .update(buffer)
        .digest("hex");

      assert.equal(result.sha256, expectedSha256);
      assert.equal(result.size_bytes, buffer.length);
      assert.ok(result.storage_key.startsWith("solver/"));
      assert.ok(result.storage_key.endsWith(`${expectedSha256}.png`));
      assert.ok(result.storage_url.startsWith("/uploads/"));

      // Verify file was actually written
      const fullPath = path.resolve(tmpDir, result.storage_key);
      assert.ok(fs.existsSync(fullPath));
      const written = fs.readFileSync(fullPath);
      assert.deepEqual(written, buffer);
    });

    it("should dedupe: same sha256 does not overwrite file", async () => {
      const buffer = Buffer.from("same-content");
      const input: ObjectPutInput = {
        buffer,
        mimeType: "image/jpeg",
        scope: "submissions",
      };

      const result1 = await storage.putImage(input);
      const result2 = await storage.putImage(input);

      // Both return same metadata
      assert.equal(result1.storage_key, result2.storage_key);
      assert.equal(result1.sha256, result2.sha256);
      assert.equal(result1.size_bytes, result2.size_bytes);

      // Only one file on disk
      const fullPath = path.resolve(tmpDir, result1.storage_key);
      assert.ok(fs.existsSync(fullPath));
    });

    it("should use correct path format: <scope>/<YYYY>/<MM>/<sha256>.<ext>", async () => {
      const buffer = Buffer.from("path-format-test");
      const input: ObjectPutInput = {
        buffer,
        mimeType: "application/pdf",
        scope: "avatars",
      };

      const result = await storage.putImage(input);

      const parts = result.storage_key.split("/");
      assert.equal(parts[0], "avatars");
      assert.match(parts[1], /^\d{4}$/); // YYYY
      assert.match(parts[2], /^\d{2}$/); // MM
      assert.ok(parts[3].endsWith(".pdf"));
    });

    it("should map common MIME types to correct extensions", async () => {
      const mimeTests: Array<{ mime: string; ext: string }> = [
        { mime: "image/jpeg", ext: "jpg" },
        { mime: "image/png", ext: "png" },
        { mime: "image/gif", ext: "gif" },
        { mime: "image/webp", ext: "webp" },
        { mime: "application/pdf", ext: "pdf" },
      ];

      for (const { mime, ext } of mimeTests) {
        const buffer = Buffer.from(`test-${mime}`);
        const result = await storage.putImage({
          buffer,
          mimeType: mime,
          scope: "solver",
        });
        assert.ok(
          result.storage_key.endsWith(`.${ext}`),
          `Expected ${result.storage_key} to end with .${ext} for MIME ${mime}`,
        );
      }
    });

    it("should delete an existing file", async () => {
      const buffer = Buffer.from("to-be-deleted");
      const input: ObjectPutInput = {
        buffer,
        mimeType: "image/png",
        scope: "solver",
      };

      const result = await storage.putImage(input);
      const fullPath = path.resolve(tmpDir, result.storage_key);
      assert.ok(fs.existsSync(fullPath));

      await storage.delete(result.storage_key);
      assert.ok(!fs.existsSync(fullPath));
    });

    it("should not throw when deleting a non-existent file", async () => {
      await assert.doesNotReject(
        storage.delete("solver/2025/01/nonexistent.png"),
      );
    });

    it("should handle different scopes correctly", async () => {
      const buffer = Buffer.from("scope-test");

      const solverResult = await storage.putImage({
        buffer,
        mimeType: "image/png",
        scope: "solver",
      });
      assert.ok(solverResult.storage_key.startsWith("solver/"));

      const submissionsResult = await storage.putImage({
        buffer,
        mimeType: "image/png",
        scope: "submissions",
      });
      assert.ok(submissionsResult.storage_key.startsWith("submissions/"));

      const avatarsResult = await storage.putImage({
        buffer,
        mimeType: "image/png",
        scope: "avatars",
      });
      assert.ok(avatarsResult.storage_key.startsWith("avatars/"));
    });
  });

  describe("S3OCRStorage", () => {
    const s3Storage = new S3OCRStorage();

    it("should throw 'S3 not configured' on putImage", async () => {
      const input: ObjectPutInput = {
        buffer: Buffer.from("test"),
        mimeType: "image/png",
        scope: "solver",
      };

      await assert.rejects(s3Storage.putImage(input), {
        message: "S3 not configured",
      });
    });

    it("should throw 'S3 not configured' on delete", async () => {
      await assert.rejects(s3Storage.delete("some/key.png"), {
        message: "S3 not configured",
      });
    });
  });
});
