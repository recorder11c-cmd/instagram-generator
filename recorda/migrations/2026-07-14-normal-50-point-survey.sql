insert into recorda_surveys(
  id,title,status,reward_note,capacity,reward_amount_yen
)
values(
  'line-50pt-2026-07',
  '50ポイント通常アンケート（モニター制度確認）',
  'draft',
  '回答完了で50ポイント。500ポイントからデジタルギフト交換申請可。現金出金なし。',
  30,
  50
)
on conflict(id) do update set
  title=excluded.title,
  reward_note=excluded.reward_note,
  capacity=excluded.capacity,
  reward_amount_yen=excluded.reward_amount_yen;
