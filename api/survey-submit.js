const { json, readBody, supabaseRpc, verifyRegistrationToken } = require('./_recorda');

const ALLOWED = {
  kyoto_relation: ['resident', 'commuter', 'visitor', 'none'],
  line_frequency: ['weekly', 'monthly', 'rarely'],
  preferred_length: ['3min', '5min', '10min'],
  topics: ['tourism', 'food', 'digital', 'lifestyle']
};
const PAID_ALLOWED = {
  reward_method: ['paypay', 'digital_gift', 'either'],
  survey_frequency: ['one_two', 'three_five', 'six_plus'],
  preferred_length: ['3min', '5min', '10min'],
  topics: ['shopping', 'food', 'travel', 'digital', 'lifestyle']
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  const body = readBody(req);
  const surveyId = body.survey_id === 'line-paid-pilot-2026-07'
    ? 'line-paid-pilot-2026-07'
    : 'line-pilot-2026-07';
  let lineUserId = null;
  try { lineUserId = verifyRegistrationToken(body.survey_token); }
  catch (error) { console.error(error); return json(res, 500, { error: '設定を確認してください。' }); }
  if (!lineUserId) return json(res, 401, { error: '回答URLの有効期限が切れています。LINEからもう一度開いてください。' });

  const topics = Array.isArray(body.topics) ? body.topics : [];
  const comment = String(body.comment || '').trim();
  const paidInvalid = surveyId === 'line-paid-pilot-2026-07' &&
    (!PAID_ALLOWED.reward_method.includes(body.reward_method) ||
     !PAID_ALLOWED.survey_frequency.includes(body.survey_frequency) ||
     !PAID_ALLOWED.preferred_length.includes(body.preferred_length) ||
     topics.some(topic => !PAID_ALLOWED.topics.includes(topic)));
  const freeInvalid = surveyId === 'line-pilot-2026-07' &&
    (!ALLOWED.kyoto_relation.includes(body.kyoto_relation) ||
     !ALLOWED.line_frequency.includes(body.line_frequency) ||
     !ALLOWED.preferred_length.includes(body.preferred_length) ||
     topics.some(topic => !ALLOWED.topics.includes(topic)));
  if (paidInvalid || freeInvalid || comment.length > 500) {
    return json(res, 400, { error: '回答内容を確認してください。' });
  }

  try {
    await supabaseRpc('submit_recorda_survey_response', {
      p_survey_id: surveyId,
      p_line_user_id: lineUserId,
      p_answers: {
        ...(surveyId === 'line-paid-pilot-2026-07'
          ? { reward_method: body.reward_method, survey_frequency: body.survey_frequency }
          : { kyoto_relation: body.kyoto_relation, line_frequency: body.line_frequency }),
        preferred_length: body.preferred_length,
        topics,
        comment
      }
    });
    return json(res, 201, { ok: true });
  } catch (error) {
    console.error(error);
    if (error.message.includes('active monitor registration required')) {
      return json(res, 403, { error: '先にLINEで「モニター登録」と送信し、登録フォームを完了してください。' });
    }
    if (error.message.includes('survey is not active')) {
      return json(res, 410, { error: 'このアンケートは受付を終了しました。' });
    }
    if (error.message.includes('survey capacity reached')) {
      return json(res, 409, { error: '定員に達したため、回答受付を終了しました。' });
    }
    return json(res, 500, { error: '回答を保存できませんでした。時間をおいてお試しください。' });
  }
};
