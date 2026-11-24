import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { env, integrationStatus } from '../config/env.ts';
import { validateAndCompressPdf } from './pdfCompressionService.ts';

if (integrationStatus.cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
    secure: true,
  });
}

const LOCAL_UPLOAD_DIR = path.resolve(process.cwd(), '.data', 'uploads');

function ensureLocalUploadDir(): void {
  if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  }
}

export interface UploadResult {
  url: string;
  publicId: string;
  sizeBytes: number;
  format: string;
  originalSizeBytes?: number;
}

export async function uploadOptimizedImage(
  buffer: Buffer,
  folder: 'profiles' | 'logos' | 'banners',
  maxWidth = 800
): Promise<UploadResult> {
  const optimized = await sharp(buffer)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  if (integrationStatus.cloudinaryConfigured) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `job-karenge/${folder}`,
          resource_type: 'image',
          format: 'webp',
          transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error || !result) {
            return reject(error || new Error('Cloudinary image upload failed'));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            sizeBytes: result.bytes,
            format: result.format,
          });
        }
      );
      stream.end(optimized);
    });
  }

  ensureLocalUploadDir();
  const id = `${folder}_${crypto.randomBytes(10).toString('hex')}.webp`;
  const filePath = path.join(LOCAL_UPLOAD_DIR, id);
  fs.writeFileSync(filePath, optimized);
  return {
    url: `/api/files/public/${id}`,
    publicId: id,
    sizeBytes: optimized.length,
    format: 'webp',
  };
}

export async function uploadCompressedResumePdf(
  buffer: Buffer,
  mimeType: string,
  candidateId: string
): Promise<UploadResult> {
  const compressed = await validateAndCompressPdf(buffer, mimeType);

  if (integrationStatus.cloudinaryConfigured) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `job-karenge/resumes/${candidateId}`,
          resource_type: 'raw',
          type: 'authenticated',
          format: 'pdf',
        },
        (error, result) => {
          if (error || !result) {
            return reject(error || new Error('Cloudinary resume upload failed'));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            sizeBytes: compressed.compressedSize,
            originalSizeBytes: compressed.originalSize,
            format: 'pdf',
          });
        }
      );
      stream.end(compressed.buffer);
    });
  }

  ensureLocalUploadDir();
  const safeId = `resume_${candidateId}_${crypto.randomBytes(8).toString('hex')}.pdf`;
  const filePath = path.join(LOCAL_UPLOAD_DIR, safeId);
  fs.writeFileSync(filePath, compressed.buffer);

  return {
    url: `/api/files/resume/${safeId}`,
    publicId: safeId,
    sizeBytes: compressed.compressedSize,
    originalSizeBytes: compressed.originalSize,
    format: 'pdf',
  };
}

export async function deleteStoredAsset(publicId: string, resourceType: 'image' | 'raw' = 'image'): Promise<void> {
  if (!publicId) return;
  if (integrationStatus.cloudinaryConfigured && !publicId.endsWith('.webp') && !publicId.endsWith('.pdf')) {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (err) {
      console.warn('[Cloudinary] Asset cleanup warning:', err);
    }
    return;
  }

  const safeName = path.basename(publicId);
  const resolved = path.resolve(LOCAL_UPLOAD_DIR, safeName);
  if (resolved.startsWith(LOCAL_UPLOAD_DIR + path.sep) && fs.existsSync(resolved)) {
    try {
      fs.unlinkSync(resolved);
    } catch {
      // ignore
    }
  }
}

export function resolveLocalFilePath(fileName: string): string | null {
  ensureLocalUploadDir();
  const safeName = path.basename(fileName);
  const resolved = path.resolve(LOCAL_UPLOAD_DIR, safeName);
  if (!resolved.startsWith(LOCAL_UPLOAD_DIR + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}
