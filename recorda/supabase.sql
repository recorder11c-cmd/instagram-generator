create extension if not exists pgcrypto;

create table if not exists recorda_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  area text not null,
  segment text not null check (segment in ('monitor','business')),
  line_user_id text unique,
  source text not null,
  status text not null default 'active' check (status in ('active','unsubscribed','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recorda_consent_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references recorda_contacts(id),
  action text not null check (action in ('granted','withdrawn')),
  consent_version text not null,
  occurred_at timestamptz not null default now()
);

create table if not exists recorda_message_queue (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references recorda_contacts(id),
  line_user_id text not null,
  message_text text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz
);

alter table recorda_contacts enable row level security;
alter table recorda_consent_events enable row level security;
alter table recorda_message_queue enable row level security;

create or replace function register_recorda_contact(
  p_name text, p_email text, p_area text, p_segment text, p_line_user_id text,
  p_consent_version text, p_source text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into recorda_contacts(name,email,area,segment,line_user_id,source)
  values(p_name,p_email,p_area,p_segment,p_line_user_id,p_source)
  on conflict(email) do update set
    name=excluded.name, area=excluded.area, segment=excluded.segment,
    line_user_id=coalesce(excluded.line_user_id,recorda_contacts.line_user_id),
    status='active', updated_at=now()
  returning id into v_id;

  insert into recorda_consent_events(contact_id,action,consent_version)
  values(v_id,'granted',p_consent_version);

  if p_line_user_id is not null then
    insert into recorda_message_queue(contact_id,line_user_id,message_text,scheduled_at)
    values
      (v_id,p_line_user_id,
       case when p_segment='monitor'
         then 'レコルダモニターへようこそ。登録情報の扱いと、アンケート参加の流れをご案内します。回答はいつでも任意です。'
         else 'ご登録ありがとうございます。まずは、手作業を減らしながら顧客対応の質を保つ事例をご紹介します。' end,
       (date_trunc('day',now() at time zone 'Asia/Tokyo')+interval '1 day 9 hours') at time zone 'Asia/Tokyo'),
      (v_id,p_line_user_id,
       case when p_segment='monitor'
         then 'アンケートのご案内時には、所要時間と謝礼を先にお伝えします。条件を確認してから参加できます。'
         else 'LINE・アンケート・AIをつなぐと、問い合わせ対応と顧客理解を一つの流れにできます。ご相談はこのLINEへどうぞ。' end,
       (date_trunc('day',now() at time zone 'Asia/Tokyo')+interval '3 days 9 hours') at time zone 'Asia/Tokyo');
  end if;
  return v_id;
end $$;

create or replace function claim_recorda_messages(p_limit integer default 50)
returns setof recorda_message_queue language plpgsql security definer set search_path = public as $$
begin
  return query
  update recorda_message_queue q set status='processing',attempts=attempts+1
  where q.id in (
    select mq.id from recorda_message_queue mq
    join recorda_contacts c on c.id=mq.contact_id
    where mq.status in ('pending','failed') and mq.scheduled_at<=now()
      and mq.attempts<3 and c.status='active'
    order by mq.scheduled_at for update skip locked limit p_limit
  ) returning q.*;
end $$;

create or replace function finish_recorda_message(p_job_id uuid,p_success boolean,p_error text)
returns void language sql security definer set search_path = public as $$
  update recorda_message_queue
  set status=case when p_success then 'sent' else 'failed' end,
      sent_at=case when p_success then now() else null end,last_error=p_error
  where id=p_job_id;
$$;

create or replace function unsubscribe_recorda_line_user(p_line_user_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update recorda_contacts set status='unsubscribed',updated_at=now()
  where line_user_id=p_line_user_id and status='active' returning id into v_id;
  if v_id is not null then
    insert into recorda_consent_events(contact_id,action,consent_version)
    values(v_id,'withdrawn','line-unfollow');
    update recorda_message_queue set status='failed',last_error='unsubscribed'
    where contact_id=v_id and status in ('pending','processing');
  end if;
end $$;

revoke all on function register_recorda_contact(text,text,text,text,text,text,text) from public;
revoke all on function claim_recorda_messages(integer) from public;
revoke all on function finish_recorda_message(uuid,boolean,text) from public;
revoke all on function unsubscribe_recorda_line_user(text) from public;
grant execute on function register_recorda_contact(text,text,text,text,text,text,text) to service_role;
grant execute on function claim_recorda_messages(integer) to service_role;
grant execute on function finish_recorda_message(uuid,boolean,text) to service_role;
grant execute on function unsubscribe_recorda_line_user(text) to service_role;
