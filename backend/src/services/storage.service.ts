import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOADS_DIR = path.resolve('./uploads');

export class StorageService {
  static init() {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  static async storeFile(tempFilePath: string, originalFilename: string) {
    this.init();
    const fileBuffer = await fs.promises.readFile(tempFilePath);
    const sha256Checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    // Store under an unguessable UUID filename
    const storageKey = `${crypto.randomUUID()}.vault`;
    const destination = path.join(UPLOADS_DIR, storageKey);

    await fs.promises.rename(tempFilePath, destination);

    return {
      storagePath: storageKey,
      sha256Checksum,
      sizeBytes: fileBuffer.length,
    };
  }

  static getFilePath(storageKey: string): string {
    return path.join(UPLOADS_DIR, path.basename(storageKey));
  }

  static async deleteFile(storageKey: string) {
    const target = path.join(UPLOADS_DIR, path.basename(storageKey));
    if (fs.existsSync(target)) {
      await fs.promises.unlink(target);
    }
  }
}