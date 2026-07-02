create table if not exists recorda_survey_waitlist (
  id uuid primary key default gen_random_uuid(),
  survey_id text not null references recorda_surveys(id),
  contact_id uuid not null references recorda_contacts(id),
  created_at timestamptz not null default now(),
  unique(survey_id,contact_id)
);

alter table recorda_survey_waitlist enable row level security;

create or replace function request_recorda_survey_entry(
  p_survey_id text,p_line_user_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_contact_id uuid;
  v_status text;
  v_capacity integer;
  v_response_count integer;
begin
  select id into v_contact_id from recorda_contacts
  where line_user_id=p_line_user_id and status='active' and segment='monitor';
  if v_contact_id is null then
    return jsonb_build_object('status','registration_required');
  end if;

  select status,capacity into v_status,v_capacity
  from recorda_surveys
  where id=p_survey_id;

  if v_status is null or v_status='draft' then
    return jsonb_build_object('status','not_open');
  end if;

  select count(*) into v_response_count
  from recorda_survey_responses
  where survey_id=p_survey_id;

  if (v_capacity is not null and v_response_count>=v_capacity)
     or (v_status='closed' and v_capacity is not null and v_response_count>=v_capacity) then
    insert into recorda_survey_waitlist(survey_id,contact_id)
    values(p_survey_id,v_contact_id)
    on conflict(survey_id,contact_id) do nothing;
    return jsonb_build_object('status','full');
  end if;

  if v_status<>'active' then
    return jsonb_build_object('status','closed');
  end if;

  return jsonb_build_object(
    'status','open',
    'remaining',case when v_capacity is null then null else v_capacity-v_response_count end
  );
end $$;

revoke all on function request_recorda_survey_entry(text,text) from public;
grant execute on function request_recorda_survey_entry(text,text) to service_role;

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
  v_response_count integer;
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

  select count(*) into v_response_count
  from recorda_survey_responses
  where survey_id=p_survey_id;

  if not v_existing_response and v_capacity is not null
     and v_response_count>=v_capacity then
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

  if v_capacity is not null and (
    select count(*) from recorda_survey_responses where survey_id=p_survey_id
  )>=v_capacity then
    update recorda_surveys set status='closed' where id=p_survey_id;
  end if;

  return v_response_id;
end $$;

revoke all on function submit_recorda_survey_response(text,text,jsonb) from public;
grant execute on function submit_recorda_survey_response(text,text,jsonb) to service_role;

create or replace view recorda_survey_waitlist_management
with (security_invoker=true) as
select
  w.created_at as 受付日時,
  s.title as 対象アンケート,
  c.name as モニター名,
  c.email as メールアドレス
from recorda_survey_waitlist w
join recorda_contacts c on c.id=w.contact_id
join recorda_surveys s on s.id=w.survey_id
order by w.created_at asc;

revoke all on recorda_survey_waitlist_management from anon, authenticated;
