create or replace view recorda_pilot_survey_report
with (security_invoker=true) as
select
  r.submitted_at as 回答日時,
  c.name as 回答者名,
  c.email as メールアドレス,
  case r.answers->>'kyoto_relation'
    when 'resident' then '京都府在住'
    when 'commuter' then '通勤・通学'
    when 'visitor' then '観光・買い物等で訪問'
    when 'none' then '特に関わりなし'
    else '未回答'
  end as 京都との関わり,
  case r.answers->>'line_frequency'
    when 'weekly' then '週1回以上'
    when 'monthly' then '月1〜3回'
    when 'rarely' then 'ほとんど使わない'
    else '未回答'
  end as line公式利用頻度,
  case r.answers->>'preferred_length'
    when '3min' then '3分以内'
    when '5min' then '5分以内'
    when '10min' then '10分以内'
    else '未回答'
  end as 希望回答時間,
  concat_ws('、',
    case when r.answers->'topics' ? 'tourism' then '京都観光・地域' end,
    case when r.answers->'topics' ? 'food' then '飲食店・買い物' end,
    case when r.answers->'topics' ? 'digital' then 'デジタルサービス・AI' end,
    case when r.answers->'topics' ? 'lifestyle' then '暮らし・働き方' end
  ) as 興味テーマ,
  coalesce(r.answers->>'comment','') as 自由記述
from recorda_survey_responses r
join recorda_contacts c on c.id=r.contact_id
where r.survey_id='line-pilot-2026-07'
order by r.submitted_at desc;

revoke all on recorda_pilot_survey_report from anon, authenticated;
