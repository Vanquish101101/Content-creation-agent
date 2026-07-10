// src/storage/createStorageClient.js
// Единственная точка выбора backend'а хранилища сгенерированных файлов.
// Контракт, которому должен соответствовать любой backend (нынешний r2Client.js
// и любой будущий): `uploadFile({ key, body, contentType }) => Promise<{ key }>`,
// `getSignedDownloadUrl(key, expiresInSeconds) => Promise<string>` и
// `deleteFile(key) => Promise<void>` (нужен для квоты хранилища, см.
// src/quota/deleteContent.js) — см. точные сигнатуры в r2Client.js. Каскады генерации (image/video/audio) вызывают только
// эти два метода через DI (`deps.image.r2` и т.д.) и ничего не знают о конкретном
// backend'е — смена backend'а не требует правок в каскадах, только новый файл с
// тем же контрактом + добавление case здесь.
// Реализован только 'r2' — гипотетические backend'ы (Supabase Storage и т.д.) не
// пишутся заранее, пока для них нет конкретной причины (см. «Доработки»/обсуждение
// квоты R2 — если понадобится, добавляется тем же способом, что и 'r2').

import { createR2Client } from './r2Client.js';

export function createStorageClient({ provider = 'r2', _createR2Client = createR2Client, ...config } = {}) {
  switch (provider) {
    case 'r2':
      return _createR2Client(config);
    default:
      throw new Error(`createStorageClient: storage provider "${provider}" is not implemented`);
  }
}
