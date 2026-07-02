alter table recorda_surveys
  add column if not exists capacity integer,
  add column if not exists reward_amount_yen integer not null default 0;

alter table recorda_surveys
  drop constraint if exists recorda_surveys_capacity_check,
  add constraint recorda_surveys_capacity_check
    check (capacity is null or capacity > 0),
  drop constraint if exists recorda_surveys_reward_amount_yen_check,
  add constraint recorda_surveys_reward_amount_yen_check
    check (reward_amount_yen >= 0);

create table if not exists recorda_reward_fulfillments (
  id uuid primary key default gen_random_uuid(),
  survey_id text not null references recorda_surveys(id),
  contact_id uuid not null references recorda_contacts(id),
  response_id uuid not null unique references recorda_survey_responses(id),
  amount_yen integer not null check (amount_yen > 0),
  delivery_method text not null default 'paypay_link'
    check (delivery_method in ('paypay_link','digital_gift')),
  status text not null default 'pending'
    check (status in ('pending','link_sent','claimed','expired','cancelled')),
  created_at timestamptz not null default now(),
  link_sent_at timestamptz,
  expires_at timestamptz,
  claimed_at timestamptz,
  note text not null default '',
  unique(survey_id,contact_id),
  check (
    (status='pending' and link_sent_at is null and expires_at is null and claimed_at is null) or
    (status='link_sent' and link_sent_at is not null and expires_at is not null and claimed_at is null) or
    (status='claimed' and link_sent_at is not null and claimed_at is not null) or
    (status='expired' and link_sent_at is not null and expires_at is not null and claimed_at is null) or
    status='cancelled'
  )
);

create table if not exists recorda_point_ledger (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references recorda_contacts(id),
  survey_id text references recorda_surveys(id),
  response_id uuid unique references recorda_survey_responses(id),
  entry_type text not null check (entry_type in ('earned','adjustment','redeemed','refund')),
  points integer not null check (points<>0),
  note text not null default '',
  created_at timestamptz not null default now(),
  check (
    (entry_type in ('earned','refund') and points>0) or
    (entry_type='redeemed' and points<0) or
    entry_type='adjustment'
  )
);

alter table recorda_reward_fulfillments enable row level security;
alter table recorda_point_ledger enable row level security;

insert into recorda_surveys(
  id,title,status,reward_note,capacity,reward_amount_yen
)
values(
  'line-paid-pilot-2026-07',
  '謝礼付きアンケート（20名限定）',
  'draft',
  '完了者へ300円相当・先着20名',
  20,
  300
)
on conflict(id) do update set
  title=excluded.title,
  reward_note=excluded.reward_note,
  capacity=excluded.capacity,
  reward_amount_yen=excluded.reward_amount_yen;

create or replace function submit_recorda_survey_response(
  p_survey_id text,p_line_user_id text,p_answers jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_contact_id uuid;
  v_response_id uuid;
  v_status text;
  v_capacity integer;
  v_reward_amount_yen integer;
  v_existing_response boolean;
begin
  select id into v_contact_id from recorda_contacts
  where line_user_id=p_line_user_id and status='active' and segment='monitor';
  if v_contact_id is null then
    raise exception 'active monitor registration required';
  end if;

  select status,capacity,reward_amount_yen
  into v_status,v_capacity,v_reward_amount_yen
  from recorda_surveys
  where id=p_survey_id
  for update;

  if v_status is null or v_status<>'active' then
    raise exception 'survey is not active';
  end if;

  select exists(
    select 1 from recorda_survey_responses
    where survey_id=p_survey_id and contact_id=v_contact_id
  ) into v_existing_response;

  if not v_existing_response and v_capacity is not null and (
    select count(*) from recorda_survey_responses
    where survey_id=p_survey_id
  )>=v_capacity then
    raise exception 'survey capacity reached';
  end if;

  insert into recorda_survey_responses(survey_id,contact_id,answers)
  values(p_survey_id,v_contact_id,p_answers)
  on conflict(survey_id,contact_id) do update
  set answers=excluded.answers,submitted_at=now()
  returning id into v_response_id;

  if v_reward_amount_yen>0 then
    insert into recorda_point_ledger(
      contact_id,survey_id,response_id,entry_type,points,note
    )
    values(
      v_contact_id,p_survey_id,v_response_id,'earned',
      v_reward_amount_yen,'アンケート回答完了'
    )
    on conflict(response_id) do nothing;

    insert into recorda_reward_fulfillments(
      survey_id,contact_id,response_id,amount_yen
    )
    values(
      p_survey_id,v_contact_id,v_response_id,v_reward_amount_yen
    )
    on conflict(survey_id,contact_id) do nothing;
  end if;

  return v_response_id;
end $$;

revoke all on function submit_recorda_survey_response(text,text,jsonb) from public;
grant execute on function submit_recorda_survey_response(text,text,jsonb) to service_role;

create or replace view recorda_reward_management
with (security_invoker=true) as
select
  f.created_at as 回答完了日時,
  c.name as 回答者名,
  c.email as メールアドレス,
  s.title as アンケート,
  f.amount_yen as 謝礼額,
  case f.delivery_method
    when 'paypay_link' then 'PayPay受け取りリンク'
    when 'digital_gift' then '代替デジタルギフト'
  end as 送付方法,
  case f.status
    when 'pending' then '未作成'
    when 'link_sent' then 'リンク送付済み'
    when 'claimed' then '受取完了'
    when 'expired' then '期限切れ'
    when 'cancelled' then '対象外'
  end as 送付状態,
  f.link_sent_at as リンク送付日時,
  f.expires_at as 受取期限,
  f.claimed_at as 受取完了日時,
  f.note as 管理メモ
from recorda_reward_fulfillments f
join recorda_contacts c on c.id=f.contact_id
join recorda_surveys s on s.id=f.survey_id
order by f.created_at asc;

revoke all on recorda_reward_management from anon, authenticated;

create or replace view recorda_point_balances
with (security_invoker=true) as
select
  c.id as contact_id,
  c.name as モニター名,
  c.email as メールアドレス,
  coalesce(sum(l.points),0)::integer as ポイント残高
from recorda_contacts c
left join recorda_point_ledger l on l.contact_id=c.id
where c.segment='monitor'
group by c.id,c.name,c.email
order by c.created_at asc;

revoke all on recorda_point_balances from anon, authenticated;
