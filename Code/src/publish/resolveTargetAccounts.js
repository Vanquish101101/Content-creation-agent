// src/publish/resolveTargetAccounts.js
// wizard.network (например 'instagram') → подключённые PostMyPost-аккаунты
// этого канала. Сопоставление через channels.code (см. help.postmypost.io/
// docs/api/get-channels), затем фильтр accounts по chanel_id + connection_status
// === 1 (подключён — см. get-accounts, AccountConnectionStatusEnum).
// Публикация ведётся во ВСЕ подключённые аккаунты этого канала, если их
// несколько (например, два разных Instagram-аккаунта) — это и даёт нужную
// гранулярность "отчёт по каждой соцсети отдельно" на уровне account_id.

const CONNECTED = 1;

export async function resolveTargetAccounts(client, projectId, network) {
  const [channels, accounts] = await Promise.all([client.getChannels(), client.getAccounts(projectId)]);

  const channel = channels.find((c) => c.code.toLowerCase() === network.toLowerCase());
  if (!channel) {
    return [];
  }

  return accounts.filter((a) => a.chanel_id === channel.id && a.connection_status === CONNECTED);
}
