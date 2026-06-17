import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const uploadsRoot = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, '..', '..', 'uploads');

const ensureUploadDir = (subdir: string): string => {
  const dir = path.join(uploadsRoot, subdir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const avatarUploadDir = ensureUploadDir('avatars');
const solverUploadDir = ensureUploadDir('solver');

const createStorage = (uploadDir: string) => multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomBytes(16).toString('hex');
    cb(null, `${name}${ext}`);
  },
});

export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'] as const;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export function isAllowedImageExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.includes(ext as (typeof ALLOWED_IMAGE_EXTENSIONS)[number]);
}

export function isAllowedImageMimeType(mimeType: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.includes(mimeType.toLowerCase() as (typeof ALLOWED_IMAGE_MIME_TYPES)[number]);
}

export function isAllowedImageUpload(filename: string, mimeType: string): boolean {
  return isAllowedImageExtension(filename) && isAllowedImageMimeType(mimeType);
}

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (isAllowedImageUpload(file.originalname, file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Ch? ch?p nh?n file ?nh h?p l? (jpg, jpeg, png, gif, webp)'));
  }
};

export const uploadAvatar = multer({
  storage: createStorage(avatarUploadDir),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('avatar');

export const uploadSolverImage = multer({
  storage: createStorage(solverUploadDir),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('image');
