const {
  CONSENT_VERSION, json, linePush, readBody, signRegistrationToken, supabaseRpc,
  verifyRegistrationClaims
} = require('./_recorda');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AGE_GROUPS = ['', '10代', '20代', '30代', '40代', '50代', '60代以上', '回答しない'];
const GENDERS = ['', '女性', '男性', 'その他', '回答しない'];
const OCCUPATIONS = [
  '',
  '会社員',
  '自営業・フリーランス',
  '会社役員・経営者',
  'パート・アルバイト',
  '学生',
  '主婦・主夫',
  '無職・休職中',
  'その他',
  '回答しない'
];

function optionalChoice(value, allowed) {
  const normalized = String(value || '').trim();
  return allowed.includes(normalized) ? normalized || null : undefined;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  const body = readBody(req);
  if (body.website) return json(res, 200, { ok: true });
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const area = String(body.area || '').trim();
  const segment = body.segment;
  const ageGroup = optionalChoice(body.age_group, AGE_GROUPS);
  const gender = optionalChoice(body.gender, GENDERS);
  const occupation = optionalChoice(body.occupation, OCCUPATIONS);
  if (!body.consent || !name || name.length > 80 || !EMAIL.test(email) || email.length > 200 ||
      !area || !['monitor', 'business'].includes(segment) ||
      ageGroup === undefined || gender === undefined || occupation === undefined) {
    return json(res, 400, { error: '入力内容と同意欄を確認してください。' });
  }
  let registrationClaims = null;
  try { registrationClaims = verifyRegistrationClaims(body.registration_token); }
  catch (error) { console.error(error); return json(res, 500, { error: '設定を確認してください。' }); }
  const lineUserId = registrationClaims?.userId || null;
  const registrationIntent = registrationClaims?.intent === 'paid' ? 'paid' : '';

  try {
    await supabaseRpc('register_recorda_contact', {
      p_name: name,
      p_email: email,
      p_area: area,
      p_segment: segment,
      p_line_user_id: lineUserId,
      p_consent_version: CONSENT_VERSION,
      p_source: lineUserId ? 'line' : 'web',
      p_age_group: ageGroup,
      p_gender: gender,
      p_occupation: occupation
    });
    if (lineUserId) {
      let next = segment === 'monitor'
        ? '今後、参加可能なアンケートをご案内します。回答は任意で、いつでも配信停止できます。'
        : '業務改善やAI活用の事例を、必要な範囲でお届けします。';
      if (segment === 'monitor' && registrationIntent === 'paid') {
        const entry = await supabaseRpc('request_recorda_survey_entry', {
          p_survey_id: 'line-paid-pilot-2026-07',
          p_line_user_id: lineUserId
        });
        if (entry?.status === 'open') {
          const token = signRegistrationToken(lineUserId);
          const baseUrl = String(process.env.PUBLIC_BASE_URL || '')
            .replace(/[\r\n\u2028\u2029]/g, '').trim().replace(/\/+$/, '');
          if (!baseUrl) throw new Error('PUBLIC_BASE_URL is not configured');
          next = `現在、20名限定・300ポイントの謝礼付きアンケートを募集中です（約3分・回答完了順）。\n${baseUrl}/recorda/paid-pilot.html?token=${encodeURIComponent(token)}`;
        } else if (entry?.status === 'full') {
          next = '今回の謝礼付きアンケートは定員に達しました。次回の募集をご案内します。回答はいつでも任意です。';
        }
      }
      await linePush(lineUserId, [{ type: 'text', text: `登録が完了しました。\n${next}` }]);
    }
    return json(res, 201, { ok: true });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: '登録処理に失敗しました。時間をおいてお試しください。' });
  }
};
