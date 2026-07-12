// src/publish/publishContent.js
// Публикация готового контента (Слайс 8) — только когда job.mode === 'publish'
// и moderation_mode === false (см. generate.js). Один аккаунт → одна отдельная
// публикация (см. postMyPostClient.js за объяснением, почему не одна
// публикация на все account_ids сразу) — так отчёт честно отражает результат
// по каждой соцсети/аккаунту отдельно («05. ТЗ», §4.3).
//
// Загрузка файла — через presigned R2-ссылку (Upload by Link), не поток
// байтов — см. postMyPostClient.js.
import { resolveTargetAccounts } from './resolveTargetAccounts.js';
import { mapContentTypeToPublicationType } from './mapContentType.js';

const UPLOAD_SUCCESS = 1;
const UPLOAD_ERROR = 2;
const PUBLICATION_PUBLISHED = 1;
const PUBLICATION_ERROR = 3;
const PUBLICATION_NOT_DELETED_DUE_TO_ERROR = 6;
const TERMINAL_PUBLICATION_STATUSES = new Set([PUBLICATION_PUBLISHED, PUBLICATION_ERROR, PUBLICATION_NOT_DELETED_DUE_TO_ERROR]);

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createContentPublisher({
  client,
  r2,
  projectId,
  pollIntervalMs = 2000,
  maxPollAttempts = 15,
  _sleep = defaultSleep
} = {}) {
  if (!client) {
    throw new Error('createContentPublisher: client is required');
  }
  if (!projectId) {
    throw new Error('createContentPublisher: projectId is required');
  }

  async function pollUploadFileId(uploadId) {
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      const status = await client.getUploadStatus(uploadId);
      if (status.status === UPLOAD_SUCCESS) {
        return status.file_id;
      }
      if (status.status === UPLOAD_ERROR) {
        throw new Error(`publishContent: PostMyPost upload ${uploadId} failed`);
      }
      await _sleep(pollIntervalMs);
    }
    throw new Error(`publishContent: PostMyPost upload ${uploadId} timed out after ${maxPollAttempts} poll attempts`);
  }

  async function pollPublicationStatus(publicationId) {
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      const publication = await client.getPublication(publicationId);
      if (TERMINAL_PUBLICATION_STATUSES.has(publication.publication_status)) {
        return publication.publication_status;
      }
      await _sleep(pollIntervalMs);
    }
    throw new Error(`publishContent: PostMyPost publication ${publicationId} timed out after ${maxPollAttempts} poll attempts`);
  }

  return async function publishContent({ wizard, r2Urls }) {
    const accounts = await resolveTargetAccounts(client, projectId, wizard.network);
    if (accounts.length === 0) {
      return [{ network: wizard.network, accountId: null, status: 'error', reason: 'no connected PostMyPost account for this network' }];
    }

    const publicationType = mapContentTypeToPublicationType(wizard.content_type, wizard.format);

    let fileIds;
    if (r2Urls?.length) {
      // Карусель (2026-07-11) — несколько файлов на одну публикацию.
      // PostMyPost принимает несколько file_ids в одной details[].file_ids
      // (help.postmypost.io/docs/api/create-publication) — та же публикация,
      // что и для одного файла, просто массив длиннее 1. Загрузка общая на
      // все аккаунты — если хотя бы одна из N загрузок не удалась, ни одна
      // публикация всё равно не сможет прикрепить полный набор файлов,
      // поэтому сразу возвращаем отчёт об ошибке по каждому аккаунту, не
      // пытаясь публиковать с неполным набором файлов.
      try {
        fileIds = [];
        for (const r2Url of r2Urls) {
          const signedUrl = await r2.getSignedDownloadUrl(r2Url);
          const upload = await client.uploadFileByUrl({ projectId, url: signedUrl });
          fileIds.push(await pollUploadFileId(upload.id));
        }
      } catch (err) {
        return accounts.map((account) => ({
          network: wizard.network,
          accountId: account.id,
          status: 'error',
          reason: `file upload failed: ${err.message}`
        }));
      }
    }

    const report = [];
    for (const account of accounts) {
      try {
        const publication = await client.createPublication({
          projectId,
          postAt: new Date().toISOString(),
          accountIds: [account.id],
          publicationStatus: 5,
          details: [{ account_id: account.id, publication_type: publicationType, content: wizard.description, file_ids: fileIds }]
        });
        const finalStatus = await pollPublicationStatus(publication.id);
        const success = finalStatus === PUBLICATION_PUBLISHED;
        report.push({
          network: wizard.network,
          accountId: account.id,
          publicationId: publication.id,
          status: success ? 'success' : 'error',
          reason: success ? null : `publication_status=${finalStatus}`
        });
      } catch (err) {
        report.push({ network: wizard.network, accountId: account.id, status: 'error', reason: err.message });
      }
    }
    return report;
  };
}
