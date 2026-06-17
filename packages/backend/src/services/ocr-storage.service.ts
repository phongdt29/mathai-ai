import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ───────────────────────────────────────────────────────────────

export type StorageScope = "solver" | "submissions" | "avatars";

export interface ObjectPutInput {
  buffer: Buffer;
  mimeType: string;
  scope: StorageScope;
}

export interface ObjectPutResult {
  storage_key: string;
  storage_url: string;
  sha256: string;
  size_bytes: number;
}

export interface IOCRStorageService {
  putImage(input: ObjectPutInput): Promise<ObjectPutResult>;
  delete(storageKey: string): Promise<void>;
}

// ── MIME → Extension mapping ────────────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

function mimeToExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase().trim();
  const ext = MIME_TO_EXT[normalized];
  if (!ext) {
    // Fallback: try to extract from mime subtype
    const parts = normalized.split("/");
    return parts[1] ?? "bin";
  }
  return ext;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function computeSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function buildStorageKey(scope: StorageScope, sha256: string, ext: string): string {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, "0");
  return `${scope}/${yyyy}/${mm}/${sha256}.${ext}`;
}

// ── Local Disk Provider ─────────────────────────────────────────────────

export class LocalDiskOCRStorage implements IOCRStorageService {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? process.env.STORAGE_LOCAL_BASE_DIR ?? "./storage";
  }

  public async putImage(input: ObjectPutInput): Promise<ObjectPutResult> {
    const { buffer, mimeType, scope } = input;
    const sha256 = computeSha256(buffer);
    const ext = mimeToExtension(mimeType);
    const storageKey = buildStorageKey(scope, sha256, ext);
    const fullPath = path.resolve(this.baseDir, storageKey);

    // Dedupe: if file with same sha256 already exists, skip write
    if (!fs.existsSync(fullPath)) {
      const dir = path.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, buffer);
    }

    return {
      storage_key: storageKey,
      storage_url: `/uploads/${storageKey}`,
      sha256,
      size_bytes: buffer.length,
    };
  }

  public async delete(storageKey: string): Promise<void> {
    const fullPath = path.resolve(this.baseDir, storageKey);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
}

// ── S3 Provider (stub — Phase 1) ───────────────────────────────────────

export class S3OCRStorage implements IOCRStorageService {
  public async putImage(_input: ObjectPutInput): Promise<ObjectPutResult> {
    throw new Error("S3 not configured");
  }

  public async delete(_storageKey: string): Promise<void> {
    throw new Error("S3 not configured");
  }
}

// ── Factory ─────────────────────────────────────────────────────────────

type StorageProvider = "local" | "s3";

function createOCRStorageService(): IOCRStorageService {
  const provider = (process.env.STORAGE_PROVIDER ?? "local") as StorageProvider;

  switch (provider) {
    case "s3":
      return new S3OCRStorage();
    case "local":
    default:
      return new LocalDiskOCRStorage();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const ocrStorageService: IOCRStorageService = createOCRStorageService();

export default ocrStorageService;
