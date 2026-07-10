// src/generation/image/cascade.js
// Каскад генерации изображений через Runway (агрегатор — один API даёт
// доступ к Gen-4.5/Gen-4 Turbo, Veo 3.1, Gemini Image3, GPT-Image-2, см. «02.
// Анализ и глубокое исследование.md»). Дешёвый тир `gen4_image_turbo`,
// эскалация на `gen4_image` при сбое запроса или неудачном статусе задачи.
//
// Runway — асинхронный API: POST /v1/text_to_image возвращает { id }, дальше
// нужно поллить GET /v1/tasks/:id до статуса SUCCEEDED/FAILED. Готовый файл
// отдаётся по ЭФЕМЕРНОЙ ссылке (истекает за 24-48 часов, см.
// https://docs.dev.runwayml.com/assets/outputs/) — обязательно скачать и
// перезалить в своё хранилище (R2), нельзя просто сохранить эту ссылку.
//
// НЕ ПОДТВЕРЖДЕНО ЖИВЫМ ВЫЗОВОМ (нет рабочих ключей Runway на момент
// написания): точный список обязательных полей запроса для чистого
// text-to-image без референсных изображений. Документация Runway показывает
// `referenceImages` как обязательное поле в развёрнутой по умолчанию вкладке
// UI (`gen4_image_turbo`), что странно для сценария "просто текстовый
// промпт" — вероятно, артефакт документации, а не реальное ограничение
// API. Тут НЕ передаём `referenceImages` (у wizard'а сейчас нет референсных
// изображений); если реальный вызов вернёт 400 из-за этого — первое, что
// нужно перепроверить.

const RUNWAY_API_URL = 'https://api.dev.runwayml.com/v1';
const RUNWAY_VERSION = '2024-11-06';
const CHEAP_MODEL = 'gen4_image_turbo';
const MAIN_MODEL = 'gen4_image';
const DEFAULT_RATIO = '1080:1080';

// Примерная стоимость по тиру (см. «02. Анализ», §2.2) — Runway не отдаёт
// точную стоимость в ответе задачи (только через отдельный account-usage
// endpoint), в отличие от OpenRouter, который даёт usage.cost напрямую.
const APPROX_COST_USD = { [CHEAP_MODEL]: 0.02, [MAIN_MODEL]: 0.2 };

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createImageCascade({
  apiKey,
  r2,
  cheapModel = CHEAP_MODEL,
  mainModel = MAIN_MODEL,
  fetchImpl = fetch,
  pollIntervalMs = 2000,
  maxPollAttempts = 30,
  _sleep = defaultSleep
} = {}) {
  if (!apiKey) {
    throw new Error('createImageCascade: apiKey is required');
  }
  if (!r2) {
    throw new Error('createImageCascade: r2 client is required (generated images must be uploaded to R2)');
  }

  function headers() {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': RUNWAY_VERSION
    };
  }

  async function startTask(model, wizard) {
    const response = await fetchImpl(`${RUNWAY_API_URL}/text_to_image`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        model,
        promptText: wizard.description,
        ratio: DEFAULT_RATIO
      })
    });
    if (!response.ok) {
      throw new Error(`generateImage: Runway HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.id;
  }

  async function pollTask(taskId) {
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      const response = await fetchImpl(`${RUNWAY_API_URL}/tasks/${taskId}`, {
        method: 'GET',
        headers: headers()
      });
      if (!response.ok) {
        throw new Error(`generateImage: Runway task-status HTTP ${response.status}`);
      }
      const task = await response.json();
      if (task.status === 'SUCCEEDED') {
        return task.output[0];
      }
      if (task.status === 'FAILED') {
        throw new Error(`generateImage: Runway task failed (${task.failure ?? 'no reason given'})`);
      }
      await _sleep(pollIntervalMs);
    }
    throw new Error(`generateImage: Runway task ${taskId} timed out after ${maxPollAttempts} poll attempts`);
  }

  async function downloadAndUpload(ephemeralUrl, telegramId) {
    const response = await fetchImpl(ephemeralUrl);
    if (!response.ok) {
      throw new Error(`generateImage: failed to download Runway output, HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const key = `${telegramId ?? 'unknown'}/${Date.now()}-image.png`;
    const { key: r2Key } = await r2.uploadFile({ key, body: buffer, contentType: 'image/png' });
    return { r2Key, sizeBytes: buffer.length };
  }

  async function generateWithModel(model, wizard) {
    const taskId = await startTask(model, wizard);
    const ephemeralUrl = await pollTask(taskId);
    const { r2Key, sizeBytes } = await downloadAndUpload(ephemeralUrl, wizard.telegram_id);
    return { r2Url: r2Key, sizeBytes, costUsd: APPROX_COST_USD[model] ?? 0 };
  }

  return async function generateImage(wizard) {
    try {
      const result = await generateWithModel(cheapModel, wizard);
      return { ...result, tier: 'cheap', model: cheapModel };
    } catch (cheapErr) {
      console.warn(`[imageCascade] cheap tier (${cheapModel}) failed: ${cheapErr.message} — escalating to ${mainModel}`);
      const result = await generateWithModel(mainModel, wizard);
      return { ...result, tier: 'main', model: mainModel, escalatedFrom: cheapModel };
    }
  };
}
