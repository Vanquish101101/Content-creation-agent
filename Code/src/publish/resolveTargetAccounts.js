// src/publish/resolveTargetAccounts.js
// wizard.networks (например ['instagram', 'telegram']) → подключённые
// PostMyPost-аккаунты каждого канала. Сопоставление через channels.code (см.
// help.postmypost.io/docs/api/get-channels), затем фильтр accounts по
// chanel_id + connection_status === 1 (подключён — см. get-accounts,
// AccountConnectionStatusEnum).
// Публикация ведётся во ВСЕ подключённые аккаунты каждого запрошенного канала,
// если их несколько (например, два разных Instagram-аккаунта) — это и даёт
// нужную гранулярность "отчёт по каждой соцсети отдельно" на уровне account_id.
//
// Мультивыбор сетей (2026-07-12, по прямому запросу пользователя) — один
// запрос теперь может целиться в несколько сетей сразу. getChannels/getAccounts
// вызываются один раз на весь набор (не по одному на сеть), затем каждая
// запрошенная сеть сопоставляется со своим списком аккаунтов — включая
// ПУСТОЙ список, если канал не найден или нет подключённых аккаунтов, чтобы
// вызывающий код (publishContent.js) мог честно отчитаться по каждой сети
// отдельно, а не молча пропустить ненайденную.

const CONNECTED = 1;

export async function resolveTargetAccounts(client, projectId, networks) {
  const [channels, accounts] = await Promise.all([client.getChannels(), client.getAccounts(projectId)]);

  return networks.map((network) => {
    const channel = channels.find((c) => c.code.toLowerCase() === network.toLowerCase());
    const matched = channel
      ? accounts.filter((a) => a.chanel_id === channel.id && a.connection_status === CONNECTED)
      : [];
    return { network, accounts: matched };
  });
}
