// src/inbox/intake.js
// Оркестрация приёма задачи от Агента 1 — соединяет чтение wizard'а, сверку
// wizard_hash и дедупликацию в один сквозной поток (см. «07. Архитектура
// (Бекенд).md», §7). Вызывается и из реальной Redis-подписки (event
// wizard_ready), и из поллинга intelligence_agent.agent4_handoff_queue —
// оба источника дают одинаковую пару { telegram_id, wizard_hash }.
//
// Дедупликация здесь только ПРОВЕРЯЕТСЯ (isWizardProcessed) — отметка
// "обработано" (markWizardProcessed) сознательно не делается тут: это
// подтверждение читается как "задача передана дальше", а не "контент
// сгенерирован" — саму отметку ставит слайс генерации после реального
// успеха, иначе сбой на этапе генерации навсегда потерял бы задачу.
import { fetchWizardSettings } from '../ingestion/agent1Reader.js';
import { isWizardProcessed } from '../dedup/processedWizardRequests.js';
import { computeWizardHash } from '../wizard/hash.js';

const DISPATCHABLE_MODES = ['content', 'publish'];

async function recordInboxEvent(db, { telegramId, wizardHash, receivedVia, status }) {
  const { error } = await db.from('inbox_events').insert({
    source: 'agent1_wizard',
    ref: wizardHash,
    telegram_id: telegramId,
    received_via: receivedVia,
    status
  });
  if (error) {
    console.error('[intake] failed to record inbox_events row:', error.message);
  }
}

export function createIntakeHandler({ db, onJob }) {
  async function handleWizardJob({ telegram_id: telegramId, wizard_hash: queueHash, receivedVia }) {
    const settings = await fetchWizardSettings(db, telegramId);

    if (!settings || !settings.wizard || !DISPATCHABLE_MODES.includes(settings.mode)) {
      await recordInboxEvent(db, { telegramId, wizardHash: queueHash, receivedVia, status: 'skipped' });
      return { status: 'skipped', reason: 'no_wizard' };
    }

    const actualHash = computeWizardHash(settings.wizard);
    if (actualHash !== queueHash) {
      console.warn(
        `[intake] wizard_hash mismatch for telegram_id=${telegramId} — queue had ${queueHash}, ` +
        `actual is ${actualHash} (wizard changed after event was published) — using actual`
      );
    }

    const alreadyProcessed = await isWizardProcessed(db, telegramId, actualHash);
    if (alreadyProcessed) {
      await recordInboxEvent(db, { telegramId, wizardHash: actualHash, receivedVia, status: 'skipped' });
      return { status: 'skipped', reason: 'already_processed' };
    }

    await recordInboxEvent(db, { telegramId, wizardHash: actualHash, receivedVia, status: 'processed' });

    await onJob({
      telegram_id: telegramId,
      wizard: settings.wizard,
      wizard_hash: actualHash,
      mode: settings.mode,
      moderation_mode: settings.moderation_mode
    });

    return { status: 'dispatched' };
  }

  return { handleWizardJob };
}
