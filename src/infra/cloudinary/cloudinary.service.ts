import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Cloudinary uploads (doctor profile photos).
 * Credentials come from env — never commit them:
 *   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 * Images are resized server-side (600x600 cover) to keep profiles light.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly ready: boolean;

  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    this.ready = !!(cloudName && apiKey && apiSecret);
    if (this.ready) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    } else {
      this.logger.warn('Cloudinary env vars missing — photo upload disabled');
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  /** Upload an in-memory image buffer, return the secure URL. */
  async uploadImage(buffer: Buffer, mimetype: string, folder = 'medflow/doctors'): Promise<string> {
    if (!this.ready) throw new Error('photo upload is not configured (Cloudinary env missing)');
    if (!mimetype.startsWith('image/')) throw new Error('only image files are allowed');
    const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
    const res = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: 'image',
      transformation: [{ width: 600, height: 600, crop: 'fill', gravity: 'face' }],
    });
    return res.secure_url as string;
  }
}
