// src/consent/handleDecision.js
// Обработка решения пользователя, пришедшего через канал согласия (пункт G,
// «Доработки для Агентов 1 и 3»): выполняет то, что было приостановлено —
// удаление старого контента (квота) или публикацию (модерация).
//
// Идемпотентность — намеренно через текущий status в собственной таблице
// generated_content, а не через отметку "обработано" в чужой таблице
// (intelligence_agent.agent4_consent_queue) — тот же принцип, что и у
// pollHandoffQueue.js (не пишем в чужую схему без необходимости). И Redis-,
// и poll-путь могут доставить одно и то же решение дважды.
import { getContentResult } from '../mcp-server/queries.js';
import { deleteGeneratedContent } from '../quota/deleteContent.js';
import { markPublishResult, markPublishRejected } from '../generation/persistence.js';
import { buildContentReport } from '../delivery/buildContentReport.js';

async function handleQuotaDeletion(db, r2, row, generatedContentId, decision) {
  if (decision !== 'approved') {
    return;
  }
  if (row.status === 'deleted') {
    return; // уже обработано
  }
  await deleteGeneratedContent(db, r2, generatedContentId);
}

async function handlePublishModeration(db, r2, publish, notifyAgent1, row, generatedContentId, decision) {
  if (row.status !== 'pending_moderation') {
    return; // уже обработано, либо решение пришло не вовремя
  }

  if (decision === 'rejected') {
    await markPublishRejected(db, generatedContentId);
    return;
  }

  const wizard = row.metadata?.wizard;
  if (!wizard) {
    console.error(`[consent/handleDecision] generated_content ${generatedContentId} has no stored wizard, cannot publish`);
    return;
  }

  let publishReport;
  if (!publish) {
    publishReport = [{ network: wizard.network, accountId: null, status: 'error', reason: 'PostMyPost not configured' }];
  } else {
    try {
      publishReport = await publish({ wizard, r2Url: row.r2_url });
    } catch (err) {
      publishReport = [{ network: wizard.network, accountId: null, status: 'error', reason: err.message }];
    }
  }
  await markPublishResult(db, generatedContentId, publishReport);

  if (notifyAgent1) {
    try {
      const report = buildContentReport({
        wizard,
        result: { text: row.metadata?.text ?? null, sizeBytes: row.size_bytes, costUsd: row.cost_usd },
        publishReport
      });
      if (row.r2_url && r2) {
        report.downloadUrl = await r2.getSignedDownloadUrl(row.r2_url);
      }
      await notifyAgent1({ telegramId: row.telegram_id, messageType: 'content_ready', generatedContentId, payload: report });
    } catch (err) {
      console.error('[consent/handleDecision] content_ready notify failed:', err.message);
    }
  }
}

export function createDecisionHandler({ db, r2, publish, notifyAgent1 }) {
  return async function handleDecision({ generatedContentId, decisionType, decision }) {
    const row = await getContentResult(db, generatedContentId);
    if (!row) {
      console.warn(`[consent/handleDecision] generated_content ${generatedContentId} not found`);
      return;
    }

    if (decisionType === 'quota_deletion') {
      await handleQuotaDeletion(db, r2, row, generatedContentId, decision);
      return;
    }

    if (decisionType === 'publish_moderation') {
      await handlePublishModeration(db, r2, publish, notifyAgent1, row, generatedContentId, decision);
    }
  };
}
