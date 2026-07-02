alter table recorda_message_queue
  add column if not exists survey_id text references recorda_surveys(id),
  add column if not exists message_kind text;

create unique index if not exists recorda_message_queue_survey_kind_unique
  on recorda_message_queue(contact_id,survey_id,message_kind)
  where survey_id is not null and message_kind is not null;

create or replace function prepare_recorda_paid_pilot_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_survey_id constant text := 'line-paid-pilot-2026-07';
  v_status text;
  v_capacity integer;
  v_response_count integer;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_message_kind text;
  v_message_text text;
  v_inserted integer := 0;
begin
  select status,capacity into v_status,v_capacity
  from recorda_surveys
  where id=v_survey_id;

  select count(*) into v_response_count
  from recorda_survey_responses
  where survey_id=v_survey_id;

  if v_status is distinct from 'active'
     or (v_capacity is not null and v_response_count>=v_capacity) then
    update recorda_message_queue
    set status='failed',last_error='survey closed'
    where survey_id=v_survey_id and status in ('pending','failed');
    return 0;
  end if;

  if v_today>=date '2026-07-08' then
    v_message_kind := 'paid-pilot-reminder-2';
    v_message_text := '【まもなく受付終了】登録済みで、謝礼付きアンケートの回答がまだ確認できていない方へご案内しています。回答完了で300ポイント、先着20名です。参加する場合は「謝礼付きアンケート」と送信してください。回答は任意です。';
  elsif v_today>=date '2026-07-05' then
    v_message_kind := 'paid-pilot-reminder-1';
    v_message_text := 'モニター登録ありがとうございます。謝礼付きアンケートの回答がまだ確認できていない方へご案内しています。回答完了で300ポイント、先着20名です。参加する場合は「謝礼付きアンケート」と送信してください。回答は任意です。';
  else
    return 0;
  end if;

  insert into recorda_message_queue(
    contact_id,line_user_id,message_text,scheduled_at,survey_id,message_kind
  )
  select
    c.id,c.line_user_id,v_message_text,now(),v_survey_id,v_message_kind
  from recorda_contacts c
  where c.status='active'
    and c.segment='monitor'
    and c.line_user_id is not null
    and not exists(
      select 1 from recorda_survey_responses r
      where r.survey_id=v_survey_id and r.contact_id=c.id
    )
  on conflict(contact_id,survey_id,message_kind)
    where survey_id is not null and message_kind is not null
  do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;

revoke all on function prepare_recorda_paid_pilot_reminders() from public;
grant execute on function prepare_recorda_paid_pilot_reminders() to service_role;
