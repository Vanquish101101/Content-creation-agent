// src/storage/r2Client.js
// Хранилище сгенерированных файлов — Cloudflare R2 (S3-совместимый API), не
// Supabase Storage: egress у R2 бесплатен всегда, что критично для контента,
// который многократно просматривают/скачивают/публикуют. См. «04. Брейншторм»,
// §6, и «07. Архитектура (Бекенд).md», §6.
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as defaultGetSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_EXPIRES_IN_SECONDS = 3600;

export function createR2Client({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucket,
  _s3,
  _getSignedUrl
} = {}) {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('createR2Client: accountId, accessKeyId, secretAccessKey, and bucket are required');
  }

  const s3 =
    _s3 ??
    new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }
    });
  const signUrl = _getSignedUrl ?? defaultGetSignedUrl;

  return {
    async uploadFile({ key, body, contentType }) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType
        })
      );
      return { key };
    },

    // Ключи в bucket не публичны по умолчанию (bucket не настроен как public,
    // кастомный домен не привязан) — доставка пользователю (Слайс 9) идёт
    // через подписанную, ограниченную по времени ссылку.
    async getSignedDownloadUrl(key, expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return signUrl(s3, command, { expiresIn: expiresInSeconds });
    }
  };
}
