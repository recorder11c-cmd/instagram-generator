create table if not exists recorda_gift_redemptions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references recorda_contacts(id),
  points integer not null check (points > 0),
  amount_yen integer not null check (amount_yen > 0),
  provider text not null default 'giftee'
    check (provider in ('giftee','paypay','other')),
  status text not null default 'requested'
    check (status in (
      'requested',
      'approved',
      'gift_ordered',
      'sent',
      'completed',
      'cancelled',
      'expired'
    )),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  note text not null default ''
);

alter table recorda_gift_redemptions enable row level security;

create index if not exists recorda_gift_redemptions_contact_status_idx
  on recorda_gift_redemptions(contact_id,status,requested_at desc);

create unique index if not exists recorda_gift_redemptions_open_unique
  on recorda_gift_redemptions(contact_id)
  where status in ('requested','approved','gift_ordered','sent');

create or replace function request_recorda_point_redemption(
  p_line_user_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_contact_id uuid;
  v_balance integer;
  v_existing_id uuid;
  v_redemption_id uuid;
  v_required_points constant integer := 500;
begin
  select id into v_contact_id
  from recorda_contacts
  where line_user_id=p_line_user_id
    and status='active'
    and segment='monitor';

  if v_contact_id is null then
    return jsonb_build_object('status','registration_required');
  end if;

  select coalesce(sum(points),0)::integer into v_balance
  from recorda_point_ledger
  where contact_id=v_contact_id;

  if v_balance < v_required_points then
    return jsonb_build_object(
      'status','insufficient',
      'balance',v_balance,
      'required_points',v_required_points,
      'remaining_points',v_required_points-v_balance
    );
  end if;

  select id into v_existing_id
  from recorda_gift_redemptions
  where contact_id=v_contact_id
    and status in ('requested','approved','gift_ordered','sent')
  order by requested_at desc
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'status','already_requested',
      'redemption_id',v_existing_id,
      'balance',v_balance
    );
  end if;

  insert into recorda_gift_redemptions(
    contact_id,points,amount_yen,provider,status,note
  )
  values(
    v_contact_id,
    v_required_points,
    500,
    'giftee',
    'requested',
    'LINEからポイント交換申請'
  )
  returning id into v_redemption_id;

  return jsonb_build_object(
    'status','accepted',
    'redemption_id',v_redemption_id,
    'balance',v_balance,
    'points',v_required_points,
    'amount_yen',500
  );
end $$;

revoke all on function request_recorda_point_redemption(text) from public;
grant execute on function request_recorda_point_redemption(text) to service_role;

create or replace view recorda_gift_redemption_management
with (security_invoker=true) as
select
  r.requested_at as 申請日時,
  c.name as モニター名,
  c.email as メールアドレス,
  r.points as 交換ポイント,
  r.amount_yen as ギフト額,
  case r.provider
    when 'giftee' then 'giftee'
    when 'paypay' then 'PayPay'
    else 'その他'
  end as 交換方法,
  case r.status
    when 'requested' then '申請中'
    when 'approved' then '承認済み'
    when 'gift_ordered' then 'ギフト発行中'
    when 'sent' then '送付済み'
    when 'completed' then '完了'
    when 'cancelled' then '取消'
    when 'expired' then '期限切れ'
  end as 状態,
  r.approved_at as 承認日時,
  r.sent_at as 送付日時,
  r.completed_at as 完了日時,
  r.expires_at as 受取期限,
  r.note as 管理メモ
from recorda_gift_redemptions r
join recorda_contacts c on c.id=r.contact_id
order by r.requested_at desc;

revoke all on recorda_gift_redemption_management from anon, authenticated;
