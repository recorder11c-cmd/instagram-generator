create or replace function prepare_recorda_paid_pilot_reminders()
returns integer language plpgsql security definer set search_path = public as $$
begin
  update recorda_message_queue
  set status='failed',last_error='paid pilot reminders disabled'
  where survey_id='line-paid-pilot-2026-07'
    and message_kind like 'paid-pilot-reminder-%'
    and status in ('pending','processing');
  return 0;
end $$;

revoke all on function prepare_recorda_paid_pilot_reminders() from public;
grant execute on function prepare_recorda_paid_pilot_reminders() to service_role;
