create table if not exists recorda_surveys (
  id text primary key,
  title text not null,
  status text not null default 'draft' check (status in ('draft','active','closed')),
  reward_note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists recorda_survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id text not null references recorda_surveys(id),
  contact_id uuid not null references recorda_contacts(id),
  answers jsonb not null,
  submitted_at timestamptz not null default now(),
  unique(survey_id,contact_id)
);

alter table recorda_surveys enable row level security;
alter table recorda_survey_responses enable row level security;

insert into recorda_surveys(id,title,status,reward_note)
values('line-pilot-2026-07','LINEとアンケートに関するテスト調査','active','テストのため謝礼なし')
on conflict(id) do update set title=excluded.title,status=excluded.status,reward_note=excluded.reward_note;

create or replace function submit_recorda_survey_response(
  p_survey_id text,p_line_user_id text,p_answers jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_contact_id uuid; v_response_id uuid;
begin
  select id into v_contact_id from recorda_contacts
  where line_user_id=p_line_user_id and status='active' and segment='monitor';
  if v_contact_id is null then
    raise exception 'active monitor registration required';
  end if;
  if not exists(select 1 from recorda_surveys where id=p_survey_id and status='active') then
    raise exception 'survey is not active';
  end if;

  insert into recorda_survey_responses(survey_id,contact_id,answers)
  values(p_survey_id,v_contact_id,p_answers)
  on conflict(survey_id,contact_id) do update
  set answers=excluded.answers,submitted_at=now()
  returning id into v_response_id;
  return v_response_id;
end $$;

revoke all on function submit_recorda_survey_response(text,text,jsonb) from public;
grant execute on function submit_recorda_survey_response(text,text,jsonb) to service_role;
