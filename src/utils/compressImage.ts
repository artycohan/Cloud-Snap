import sharp from 'sharp';

export interface CompressionResult {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    size: number;
}

/**
 * Compresses an image to WebP using the imgcompress algorithm.
 * 
 * Algorithm:
 * 1. Checks if extension is supported: .jpg, .jpeg, .png, .webp, .bmp, .tiff (case-insensitive).
 * 2. Reads dimensions of the image.
 * 3. If max(width, height) > maxDim, resizes so max(width, height) = maxDim, maintaining aspect ratio.
 * 4. Compresses to WebP format with the specified quality.
 */
export async function compressImage(
    fileBuffer: Buffer,
    originalFilename: string,
    quality: number = 82,
    maxDim: number = 2048
): Promise<CompressionResult> {
    const parts = originalFilename.split('.');
    const ext = parts.length > 1 ? '.' + parts.pop()?.toLowerCase() : '';
    const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff']);

    if (!SUPPORTED.has(ext)) {
        // Return original if format is not supported (e.g. video, gif, etc.)
        return {
            buffer: fileBuffer,
            filename: originalFilename,
            mimeType: getMimeType(ext),
            size: fileBuffer.length
        };
    }

    let sharpImg = sharp(fileBuffer);
    const metadata = await sharpImg.metadata();
    const w = metadata.width || 0;
    const h = metadata.height || 0;

    const needsResize = w > maxDim || h > maxDim;
    if (needsResize) {
        if (w > h) {
            sharpImg = sharpImg.resize({ width: maxDim });
        } else {
            sharpImg = sharpImg.resize({ height: maxDim });
        }
    }

    // Convert to webp with specified quality
    const compressedBuffer = await sharpImg.webp({ quality }).toBuffer();
    
    // Replace extension with webp
    const nameWithoutExt = originalFilename.substring(0, originalFilename.lastIndexOf('.')) || originalFilename;
    const newFilename = `${nameWithoutExt}.webp`;

    return {
        buffer: compressedBuffer,
        filename: newFilename,
        mimeType: 'image/webp',
        size: compressedBuffer.length
    };
}

function getMimeType(ext: string): string {
    switch (ext) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.webp':
            return 'image/webp';
        case '.bmp':
            return 'image/bmp';
        case '.tiff':
            return 'image/tiff';
        default:
            return 'application/octet-stream';
    }
}
