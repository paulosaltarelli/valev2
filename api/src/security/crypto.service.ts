import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

type EncryptedPayload = {
  v: 1;
  iv: string; // base64
  tag: string; // base64
  data: string; // base64
};

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) throw new Error('CREDENTIALS_ENCRYPTION_KEY not configured');

  // aceita base64 ou hex
  const buf =
    /^[0-9a-fA-F]+$/.test(raw) && raw.length >= 64
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');

  if (buf.length !== 32)
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be 32 bytes');
  return buf;
}

@Injectable()
export class CryptoService {
  encryptJson(value: unknown): string {
    const key = getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const payload: EncryptedPayload = {
      v: 1,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: ciphertext.toString('base64'),
    };
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  }

  decryptJson<T = unknown>(encoded: string): T {
    const key = getKey();
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const payload = JSON.parse(decoded) as EncryptedPayload;
    if (payload?.v !== 1) throw new Error('Unsupported payload version');

    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const data = Buffer.from(payload.data, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  }
}
