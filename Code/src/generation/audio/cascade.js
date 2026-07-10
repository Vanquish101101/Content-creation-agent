// src/generation/audio/cascade.js
// Каскад генерации озвучки: Deepgram Aura (дешёвый тир) → ElevenLabs
// (основной, клонированный/фирменный голос бренда) при сбое. См. «05. ТЗ»,
// §4.1, «02. Анализ», §2.3.
//
// В отличие от Runway/MiniMax (Слайсы 4-5), обе API — СИНХРОННЫЕ: один
// POST-запрос сразу возвращает готовые аудио-байты, без задачи/поллинга.
// Контракт сверен с реальной документацией (developers.deepgram.com,
// elevenlabs.io/docs/api-reference), не придуман.
//
// elevenLabsVoiceId обязателен и не имеет дефолта — реального подтверждённого
// ID "фирменного голоса бренда" ещё нет (клонирование голоса не настроено),
// намеренно не подставляю угаданный voice_id.

const DEEPGRAM_MODEL = 'aura-2-thalia-en';
const DEEPGRAM_COST_PER_1K_CHARS = 0.03;
const ELEVENLABS_COST_PER_1K_CHARS = 0.18;

export function createAudioCascade({
  deepgramApiKey,
  elevenLabsApiKey,
  elevenLabsVoiceId,
  r2,
  fetchImpl = fetch
} = {}) {
  if (!deepgramApiKey) {
    throw new Error('createAudioCascade: deepgramApiKey is required');
  }
  if (!elevenLabsApiKey) {
    throw new Error('createAudioCascade: elevenLabsApiKey is required');
  }
  if (!elevenLabsVoiceId) {
    throw new Error('createAudioCascade: elevenLabsVoiceId is required');
  }
  if (!r2) {
    throw new Error('createAudioCascade: r2 client is required (generated audio must be uploaded to R2)');
  }

  async function callDeepgram(text) {
    const response = await fetchImpl(`https://api.deepgram.com/v1/speak?model=${DEEPGRAM_MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
    if (!response.ok) {
      throw new Error(`generateAudio: Deepgram HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async function callElevenLabs(text) {
    const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
    if (!response.ok) {
      throw new Error(`generateAudio: ElevenLabs HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async function uploadToR2(buffer, telegramId) {
    const key = `${telegramId ?? 'unknown'}/${Date.now()}-audio.mp3`;
    const { key: r2Key } = await r2.uploadFile({ key, body: buffer, contentType: 'audio/mpeg' });
    return { r2Key, sizeBytes: buffer.length };
  }

  function estimateCost(text, ratePer1kChars) {
    return (text.length / 1000) * ratePer1kChars;
  }

  return async function generateAudio(wizard) {
    const text = wizard.description;
    try {
      const buffer = await callDeepgram(text);
      const { r2Key, sizeBytes } = await uploadToR2(buffer, wizard.telegram_id);
      return { r2Url: r2Key, sizeBytes, costUsd: estimateCost(text, DEEPGRAM_COST_PER_1K_CHARS), tier: 'cheap', model: 'deepgram-aura-2' };
    } catch (cheapErr) {
      console.warn(`[audioCascade] cheap tier (deepgram-aura-2) failed: ${cheapErr.message} — escalating to elevenlabs`);
      const buffer = await callElevenLabs(text);
      const { r2Key, sizeBytes } = await uploadToR2(buffer, wizard.telegram_id);
      return { r2Url: r2Key, sizeBytes, costUsd: estimateCost(text, ELEVENLABS_COST_PER_1K_CHARS), tier: 'main', model: 'elevenlabs', escalatedFrom: 'deepgram-aura-2' };
    }
  };
}
