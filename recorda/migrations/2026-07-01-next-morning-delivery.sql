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

revoke all on function register_recorda_contact(text,text,text,text,text,text,text) from public;
grant execute on function register_recorda_contact(text,text,text,text,text,text,text) to service_role;
