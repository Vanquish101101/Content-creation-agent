// src/publish/postMyPostClient.js
// Клиент PostMyPost (Слайс 8) — публикация готового контента. Контракт сверен
// с реальной документацией (help.postmypost.io/docs/api), версия API v4.1,
// Bearer-токен.
//
// Загрузка файла — вариант "Upload by Link" (POST /upload/init с { project_id,
// url }), не "Direct File Upload" (нам не нужен: у нас уже есть R2 presigned
// URL, самим стримить байты не требуется — сервис сам скачивает по ссылке).
// После /upload/init нужно поллить /upload/status?id=... до status===1, чтобы
// получить file_id (сам /upload/init для upload-by-link НЕ возвращает file_id
// напрямую — только id/url/size/status по документированной схеме).
//
// Один вызов createPublication покрывает несколько account_ids сразу, но
// publication_status в ответе — один на весь вызов, не по каждому account_id
// отдельно (в документированной схеме `details[]` нет поля статуса/ошибки на
// элемент) — поэтому для честного отчёта "по каждой соцсети отдельно" (см.
// «05. ТЗ», §4.3) вызывающий код (publishContent.js) создаёт ОТДЕЛЬНУЮ
// публикацию на каждый account_id, а не одну на всех сразу.

const POSTMYPOST_API_URL = 'https://api.postmypost.io/v4.1';

export function createPostMyPostClient({ apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) {
    throw new Error('createPostMyPostClient: apiKey is required');
  }

  function headers() {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  async function getJson(response, label) {
    if (!response.ok) {
      throw new Error(`postMyPostClient: ${label} HTTP ${response.status}`);
    }
    return response.json();
  }

  async function getChannels() {
    const response = await fetchImpl(`${POSTMYPOST_API_URL}/channels?per_page=50`, { headers: headers() });
    const data = await getJson(response, 'getChannels');
    return data.data;
  }

  async function getAccounts(projectId) {
    const response = await fetchImpl(`${POSTMYPOST_API_URL}/accounts?project_id=${projectId}&per_page=50`, { headers: headers() });
    const data = await getJson(response, 'getAccounts');
    return data.data;
  }

  async function uploadFileByUrl({ projectId, url }) {
    const response = await fetchImpl(`${POSTMYPOST_API_URL}/upload/init`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ project_id: projectId, url })
    });
    return getJson(response, 'uploadFileByUrl');
  }

  async function getUploadStatus(uploadId) {
    const response = await fetchImpl(`${POSTMYPOST_API_URL}/upload/status?id=${uploadId}`, { headers: headers() });
    return getJson(response, 'getUploadStatus');
  }

  async function createPublication({ projectId, postAt, accountIds, publicationStatus, details }) {
    const response = await fetchImpl(`${POSTMYPOST_API_URL}/publications`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        project_id: projectId,
        post_at: postAt,
        account_ids: accountIds,
        publication_status: publicationStatus,
        details
      })
    });
    return getJson(response, 'createPublication');
  }

  async function getPublication(id) {
    const response = await fetchImpl(`${POSTMYPOST_API_URL}/publications/${id}`, { headers: headers() });
    return getJson(response, 'getPublication');
  }

  return { getChannels, getAccounts, uploadFileByUrl, getUploadStatus, createPublication, getPublication };
}
