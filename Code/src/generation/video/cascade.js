// src/generation/video/cascade.js
// Каскад генерации видео через MiniMax (реальный, подтверждённый API-контракт,
// platform.minimax.io/docs/api-reference/video-generation-t2v). Оба тира — один
// и тот же провайдер (не два разных, как черновик в «05. ТЗ»), по двум
// осознанным причинам, найденным при подготовке этого слайса:
//
// 1. OpenAI Sora 2 (второй вариант основного тира по ТЗ) объявлен deprecated,
//    отключается 24 сентября 2026 — интегрировать сейчас бессмысленно.
// 2. Видео у Runway доступно только как image_to_video (обязательный
//    promptImage) — для чистого текстового промпта без готовой картинки не
//    подходит без отдельного пайплайна "сначала картинка, потом видео из неё".
//
// Дешёвый тир — MiniMax-Hailuo-02, 768P, fast_pretreatment. Основной —
// MiniMax-Hailuo-2.3, 1080P, без fast_pretreatment. Эскалация — на HTTP-сбой,
// на base_resp.status_code !== 0 (API-уровневая ошибка MiniMax, возвращается
// с HTTP 200) или на status: "Fail" у задачи.
//
// Три HTTP-шага: POST /v1/video_generation -> {task_id}, поллинг
// GET /v1/query/video_generation?task_id -> статус, при Success — file_id,
// затем GET /v1/files/retrieve?file_id -> download_url (эфемерная, скачать
// сразу и перезалить в R2, не хранить ссылку саму по себе).

const MINIMAX_API_URL = 'https://api.minimax.io/v1';
const CHEAP_SETTINGS = { model: 'MiniMax-Hailuo-02', resolution: '768P', fastPretreatment: true };
const MAIN_SETTINGS = { model: 'MiniMax-Hailuo-2.3', resolution: '1080P', fastPretreatment: false };
const DURATION_SECONDS = 6;
const TERMINAL_SUCCESS = 'Success';
const TERMINAL_FAIL = 'Fail';

// Примерная стоимость (см. «02. Анализ», §2.6) — MiniMax не отдаёт точную
// стоимость задачи в ответе (как и Runway), только по отдельному
// account-usage endpoint. Не точная метрика, как OpenRouter's usage.cost.
const APPROX_COST_USD = { [CHEAP_SETTINGS.model]: 0.1, [MAIN_SETTINGS.model]: 0.28 };

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createVideoCascade({
  apiKey,
  r2,
  fetchImpl = fetch,
  pollIntervalMs = 3000,
  maxPollAttempts = 40,
  _sleep = defaultSleep
} = {}) {
  if (!apiKey) {
    throw new Error('createVideoCascade: apiKey is required');
  }
  if (!r2) {
    throw new Error('createVideoCascade: r2 client is required (generated videos must be uploaded to R2)');
  }

  function headers() {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async function startTask(settings, wizard) {
    const response = await fetchImpl(`${MINIMAX_API_URL}/video_generation`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        model: settings.model,
        prompt: wizard.description,
        duration: DURATION_SECONDS,
        resolution: settings.resolution,
        fast_pretreatment: settings.fastPretreatment
      })
    });
    if (!response.ok) {
      throw new Error(`generateVideo: MiniMax HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.base_resp?.status_code !== 0) {
      throw new Error(`generateVideo: MiniMax API error (${data.base_resp?.status_msg ?? 'unknown'})`);
    }
    return data.task_id;
  }

  async function pollTask(taskId) {
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      const response = await fetchImpl(`${MINIMAX_API_URL}/query/video_generation?task_id=${taskId}`, {
        method: 'GET',
        headers: headers()
      });
      if (!response.ok) {
        throw new Error(`generateVideo: MiniMax task-status HTTP ${response.status}`);
      }
      const task = await response.json();
      if (task.status === TERMINAL_SUCCESS) {
        return task.file_id;
      }
      if (task.status === TERMINAL_FAIL) {
        throw new Error('generateVideo: MiniMax task failed');
      }
      await _sleep(pollIntervalMs);
    }
    throw new Error(`generateVideo: MiniMax task ${taskId} timed out after ${maxPollAttempts} poll attempts`);
  }

  async function retrieveDownloadUrl(fileId) {
    const response = await fetchImpl(`${MINIMAX_API_URL}/files/retrieve?file_id=${fileId}`, {
      method: 'GET',
      headers: headers()
    });
    if (!response.ok) {
      throw new Error(`generateVideo: MiniMax files/retrieve HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.file.download_url;
  }

  async function downloadAndUpload(downloadUrl, telegramId) {
    const response = await fetchImpl(downloadUrl);
    if (!response.ok) {
      throw new Error(`generateVideo: failed to download MiniMax output, HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const key = `${telegramId ?? 'unknown'}/${Date.now()}-video.mp4`;
    const { key: r2Key } = await r2.uploadFile({ key, body: buffer, contentType: 'video/mp4' });
    return r2Key;
  }

  async function generateWithSettings(settings, wizard) {
    const taskId = await startTask(settings, wizard);
    const fileId = await pollTask(taskId);
    const downloadUrl = await retrieveDownloadUrl(fileId);
    const r2Url = await downloadAndUpload(downloadUrl, wizard.telegram_id);
    return { r2Url, costUsd: APPROX_COST_USD[settings.model] ?? 0 };
  }

  return async function generateVideo(wizard) {
    try {
      const result = await generateWithSettings(CHEAP_SETTINGS, wizard);
      return { ...result, tier: 'cheap', model: CHEAP_SETTINGS.model };
    } catch (cheapErr) {
      console.warn(`[videoCascade] cheap tier (${CHEAP_SETTINGS.model}) failed: ${cheapErr.message} — escalating to ${MAIN_SETTINGS.model}`);
      const result = await generateWithSettings(MAIN_SETTINGS, wizard);
      return { ...result, tier: 'main', model: MAIN_SETTINGS.model, escalatedFrom: CHEAP_SETTINGS.model };
    }
  };
}
