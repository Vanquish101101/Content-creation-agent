// src/publish/publishContent.js
// Публикация готового контента (Слайс 8) — только когда job.mode === 'publish'
// и moderation_mode === false (см. generate.js). Один аккаунт → одна отдельная
// публикация (см. postMyPostClient.js за объяснением, почему не одна
// публикация на все account_ids сразу) — так отчёт честно отражает результат
// по каждой соцсети/аккаунту отдельно («05. ТЗ», §4.3).
//
// Загрузка файла — через presigned R2-ссылку (Upload by Link), не поток
// байтов — см. postMyPostClient.js.
//
// Мультивыбор сетей + выбор PostMyPost-проекта (2026-07-12, по прямому
// запросу пользователя — на аккаунте теперь два проекта: "Marketing" и
// "Project CORE", каждый со своими подключёнными соцсетями). wizard.project
// (код проекта, напр. 'marketing') резолвится в реальный numeric project_id
// через карту `projects`, переданную при создании паблишера — заменяет
// прежний фиксированный `projectId` в конструкторе, т.к. project теперь
// выбирается за запрос, а не один раз на весь процесс. wizard.network
// (строка) заменён на wizard.networks (массив) — публикация проходит по
// каждой запрошенной сети независимо, ошибка по одной сети не блокирует
// остальные.
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
  projects,
  pollIntervalMs = 2000,
  maxPollAttempts = 15,
  _sleep = defaultSleep
} = {}) {
  if (!client) {
    throw new Error('createContentPublisher: client is required');
  }
  if (!projects || Object.keys(projects).length === 0) {
    throw new Error('createContentPublisher: projects is required (map of project code -> PostMyPost project_id)');
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
    const networks = wizard.networks ?? [];
    const projectId = projects[wizard.project];
    if (!projectId) {
      return networks.map((network) => ({
        network,
        accountId: null,
        status: 'error',
        reason: `unknown or unconfigured PostMyPost project "${wizard.project}"`
      }));
    }

    const targets = await resolveTargetAccounts(client, projectId, networks);
    const hasAnyAccount = targets.some((t) => t.accounts.length > 0);
    if (!hasAnyAccount) {
      return targets.map(({ network }) => ({
        network,
        accountId: null,
        status: 'error',
        reason: 'no connected PostMyPost account for this network'
      }));
    }

    const publicationType = mapContentTypeToPublicationType(wizard.content_type, wizard.format);

    let fileIds;
    if (r2Urls?.length) {
      // Карусель (2026-07-11) — несколько файлов на одну публикацию.
      // PostMyPost принимает несколько file_ids в одной details[].file_ids
      // (help.postmypost.io/docs/api/create-publication) — та же публикация,
      // что и для одного файла, просто массив длиннее 1. Загрузка общая на
      // все аккаунты ВО ВСЕХ сетях — если хотя бы одна из N загрузок не
      // удалась, ни одна публикация всё равно не сможет прикрепить полный
      // набор файлов, поэтому сразу возвращаем отчёт об ошибке по каждому
      // аккаунту в каждой запрошенной сети, не пытаясь публиковать с
      // неполным набором файлов.
      try {
        fileIds = [];
        for (const r2Url of r2Urls) {
          const signedUrl = await r2.getSignedDownloadUrl(r2Url);
          const upload = await client.uploadFileByUrl({ projectId, url: signedUrl });
          fileIds.push(await pollUploadFileId(upload.id));
        }
      } catch (err) {
        return targets.flatMap(({ network, accounts }) =>
          (accounts.length ? accounts : [{ id: null }]).map((account) => ({
            network,
            accountId: account.id,
            status: 'error',
            reason: `file upload failed: ${err.message}`
          }))
        );
      }
    }

    const report = [];
    for (const { network, accounts } of targets) {
      if (accounts.length === 0) {
        report.push({ network, accountId: null, status: 'error', reason: 'no connected PostMyPost account for this network' });
        continue;
      }
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
            network,
            accountId: account.id,
            publicationId: publication.id,
            status: success ? 'success' : 'error',
            reason: success ? null : `publication_status=${finalStatus}`
          });
        } catch (err) {
          report.push({ network, accountId: account.id, status: 'error', reason: err.message });
        }
      }
    }
    return report;
  };
}
