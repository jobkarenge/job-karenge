import { PDFDocument } from 'pdf-lib';
import { db } from '../store/dataLayer.ts';

export const MAX_PDF_BYTES = 1024 * 1024; // 1 MB default limit

export interface CompressedPdfResult {
  buffer: Buffer;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
}

export function isPdfBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

export async function validateAndCompressPdf(
  inputBuffer: Buffer,
  mimeType: string
): Promise<CompressedPdfResult> {
  if (mimeType !== 'application/pdf') {
    throw new Error('Only PDF documents are accepted for resumes.');
  }

  if (!isPdfBuffer(inputBuffer)) {
    throw new Error('Invalid file signature. Please upload a valid PDF document.');
  }

  const maxBytes = db.getPlatformSettings().maxPdfSizeBytes || MAX_PDF_BYTES;
  const maxMbLabel = (maxBytes / (1024 * 1024)).toFixed(2).replace(/\.00$/, '');
  const originalSize = inputBuffer.length;

  // Avoid unnecessary repeated compression if already comfortably under limit
  if (originalSize <= Math.min(650 * 1024, maxBytes * 0.7)) {
    return {
      buffer: inputBuffer,
      originalSize,
      compressedSize: originalSize,
      wasCompressed: false,
    };
  }

  try {
    const pdfDoc = await PDFDocument.load(inputBuffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    // Strip heavy metadata fields to shrink footprint
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('Job Karenge PDF Optimizer');
    pdfDoc.setCreator('Job Karenge');

    const compressedUint8 = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 100,
    });

    const compressedBuffer = Buffer.from(compressedUint8);
    const bestBuffer = compressedBuffer.length < originalSize ? compressedBuffer : inputBuffer;

    if (bestBuffer.length > maxBytes) {
      const mb = (bestBuffer.length / (1024 * 1024)).toFixed(2);
      throw new Error(
        `Resume remains ${mb} MB after compression, which exceeds the ${maxMbLabel} MB limit. Please upload a smaller PDF document.`
      );
    }

    return {
      buffer: bestBuffer,
      originalSize,
      compressedSize: bestBuffer.length,
      wasCompressed: bestBuffer.length < originalSize,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('exceeds the')) {
      throw err;
    }
    if (originalSize <= maxBytes) {
      return {
        buffer: inputBuffer,
        originalSize,
        compressedSize: originalSize,
        wasCompressed: false,
      };
    }
    throw new Error(
      `Unable to compress this PDF below ${maxMbLabel} MB. Please export a lighter PDF (under ${maxMbLabel} MB) and try again.`
    );
  }
}
