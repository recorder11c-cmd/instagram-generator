const crypto = require('crypto');
const { json, linePush, lineReply, signRegistrationToken, supabaseRpc } = require('./_recorda');

const NORMAL_50_SURVEY_ID = 'line-50pt-2026-07';

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function registrationMessages(userId, intent = '') {
  const token = signRegistrationToken(userId, intent);
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/[\r\n\u2028\u2029]/g, '').trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('PUBLIC_BASE_URL is not configured');
  const intro = intent === 'paid'
    ? '先にモニター登録を完了してください。登録後、今回の謝礼付きアンケートをご案内します。'
    : '次のフォームで、ご希望の情報を選んでください。';
  return [{
    type: 'text',
    text: `${intro}\n${baseUrl}/recorda/?token=${encodeURIComponent(token)}`
  }];
}

async function sendLineMessage(userId, replyToken, messages) {
  if (replyToken) {
    await lineReply(replyToken, messages);
    return;
  }
  await linePush(userId, messages);
}

async function sendRegistrationLink(userId, intent = '', replyToken = '') {
  await sendLineMessage(userId, replyToken, registrationMessages(userId, intent));
}

async function sendSurveyLink(userId, replyToken = '') {
  const token = signRegistrationToken(userId);
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/[\r\n\u2028\u2029]/g, '').trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('PUBLIC_BASE_URL is not configured');
  await sendLineMessage(userId, replyToken, [{
    type: 'text',
    text: `テストアンケートはこちらです（約2分・謝礼なし）。\n${baseUrl}/recorda/survey.html?token=${encodeURIComponent(token)}`
  }]);
}

async function sendPaidSurveyLink(userId, replyToken = '') {
  const entry = await supabaseRpc('request_recorda_survey_entry', {
    p_survey_id: 'line-paid-pilot-2026-07',
    p_line_user_id: userId
  });
  if (entry?.status === 'registration_required') {
    await sendRegistrationLink(userId, 'paid', replyToken);
    return;
  }
  if (entry?.status === 'not_open') {
    await sendLineMessage(userId, replyToken, [{
      type: 'text',
      text: '謝礼付きアンケートはまだ募集開始前です。募集開始までしばらくお待ちください。'
    }]);
    return;
  }
  if (entry?.status === 'full') {
    await sendLineMessage(userId, replyToken, [{
      type: 'text',
      text: 'ご応募ありがとうございます。今回は定員に達したため受付を終了しました。次回の募集をお待ちください。'
    }]);
    return;
  }
  if (entry?.status !== 'open') {
    await sendLineMessage(userId, replyToken, [{
      type: 'text',
      text: 'このアンケートは受付を終了しました。次回の募集をお待ちください。'
    }]);
    return;
  }
  const token = signRegistrationToken(userId);
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/[\r\n\u2028\u2029]/g, '').trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('PUBLIC_BASE_URL is not configured');
  await sendLineMessage(userId, replyToken, [{
    type: 'text',
    text: `20名限定・300ポイントの謝礼付きアンケートです（約3分）。参加条件をご確認ください。ポイント付与予定日は2026年7月10日です。\n${baseUrl}/recorda/paid-pilot.html?token=${encodeURIComponent(token)}`
  }]);
}

async function sendNormal50SurveyLink(userId, replyToken = '') {
  const entry = await supabaseRpc('request_recorda_survey_entry', {
    p_survey_id: NORMAL_50_SURVEY_ID,
    p_line_user_id: userId
  });
  if (entry?.status === 'registration_required') {
    await sendRegistrationLink(userId, '', replyToken);
    return;
  }
  if (entry?.status === 'not_open') {
    await sendLineMessage(userId, replyToken, [{
      type: 'text',
      text: '50ポイントアンケートは現在準備中です。開始までしばらくお待ちください。'
    }]);
    return;
  }
  if (entry?.status === 'full') {
    await sendLineMessage(userId, replyToken, [{
      type: 'text',
      text: 'ご応募ありがとうございます。今回の50ポイントアンケートは受付を終了しました。次回の募集をお待ちください。'
    }]);
    return;
  }
  if (entry?.status !== 'open') {
    await sendLineMessage(userId, replyToken, [{
      type: 'text',
      text: 'このアンケートは受付を終了しました。次回の募集をお待ちください。'
    }]);
    return;
  }
  const token = signRegistrationToken(userId);
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/[\r\n\u2028\u2029]/g, '').trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('PUBLIC_BASE_URL is not configured');
  await sendLineMessage(userId, replyToken, [{
    type: 'text',
    text: `50ポイント対象の短いアンケートです（約1〜2分）。回答は任意です。ポイントは500ポイントからデジタルギフトへ交換申請できます。\n${baseUrl}/recorda/normal-survey.html?token=${encodeURIComponent(token)}`
  }]);
}

function normalizeLineText(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[「」『』【】［］\[\]（）()<>＜＞"“”'‘’]/g, '')
    .replace(/[\s　]+/g, '')
    .replace(/[!！?？。、．.]+$/g, '');
}

function isSurveyRequest(text) {
  const normalized = normalizeLineText(text);
  return [
    'アンケート',
    'アンケート参加',
    'アンケートに参加',
    'アンケートに参加する'
  ].includes(normalized);
}

function isPointRedemptionRequest(text) {
  const normalized = normalizeLineText(text);
  return [
    'ポイント交換',
    'ポイントを交換',
    'ポイント交換申請',
    'ギフト交換',
    'デジタルギフト交換'
  ].includes(normalized);
}

function isNormal50SurveyRequest(text) {
  const normalized = normalizeLineText(text);
  return [
    '50ポイントアンケート',
    '50ポイント調査',
    '通常アンケート',
    '通常調査',
    '短いアンケート'
  ].includes(normalized);
}

function isRegistrationRequest(text) {
  const normalized = normalizeLineText(text);
  return [
    'モニター登録',
    '登録フォーム',
    '登録',
    '参加',
    'モニター',
    'モニター参加',
    '参加したい',
    '登録したい'
  ].includes(normalized);
}

function isBusinessConsultationRequest(text) {
  const normalized = normalizeLineText(text);
  return [
    '業務改善AI相談',
    '業務改善・AI相談',
    'AI相談',
    '相談'
  ].includes(normalized);
}

async function sendPointRedemptionReply(userId, replyToken = '') {
  const result = await supabaseRpc('request_recorda_point_redemption', {
    p_line_user_id: userId
  });
  if (result?.status === 'registration_required') {
    await sendLineMessage(userId, replyToken, [{
      type: 'text',
      text: 'ポイント交換には、先にモニター登録が必要です。登録フォームをご案内します。'
    }, ...registrationMessages(userId)]);
    return;
  }
  if (result?.status === 'insufficient') {
    const balance = Number(result.balance || 0);
    const remaining = Number(result.remaining_points || 0);
    await sendLineMessage(userId, replyToken, [{
      type: 'text',
      text: `現在のポイントは${balance}ポイントです。\nデジタルギフトへの交換は500ポイントから受け付けています。あと${remaining}ポイントで交換できます。`
    }]);
    return;
  }
  if (result?.status === 'already_requested') {
    await sendLineMessage(userId, replyToken, [{
      type: 'text',
      text: 'ポイント交換申請はすでに受け付けています。確認後、デジタルギフトの受け取りリンクをこのトークでお送りします。'
    }]);
    return;
  }
  if (result?.status === 'accepted') {
    await sendLineMessage(userId, replyToken, [{
      type: 'text',
      text: '500ポイントの交換申請を受け付けました。確認後、デジタルギフトの受け取りリンクをこのトークでお送りします。'
    }]);
    return;
  }
  await sendLineMessage(userId, replyToken, [{
    type: 'text',
    text: 'ポイント交換の受付状況を確認できませんでした。時間をおいてもう一度お試しください。'
  }]);
}

async function sendGeneralMessageReply(userId, replyToken = '') {
  await sendLineMessage(userId, replyToken, [{
    type: 'text',
    text: 'メッセージありがとうございます。内容を確認しました。\nモニター登録をご希望の場合は「モニター登録」、ポイント交換をご希望の場合は「ポイント交換」と送信してください。'
  }]);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  const raw = await rawBody(req);
  const channelSecret = String(process.env.LINE_CHANNEL_SECRET || '').replace(/[\r\n\u2028\u2029]/g, '').trim();
  const expected = crypto.createHmac('sha256', channelSecret).update(raw).digest('base64');
  const received = req.headers['x-line-signature'] || '';
  const a = Buffer.from(expected); const b = Buffer.from(received);
  if (!channelSecret || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return json(res, 401, { error: 'Invalid signature' });
  }
  const events = JSON.parse(raw).events || [];
  await Promise.all(events.map(async event => {
    try {
      const userId = event.source?.userId;
      if (!userId) return;
      const replyToken = event.replyToken;
      if (event.type === 'follow') {
        await sendLineMessage(userId, replyToken, [
          { type: 'text', text: '友だち追加ありがとうございます。' },
          ...registrationMessages(userId)
        ]);
        return;
      }
      if (event.type === 'unfollow') {
        await supabaseRpc('unsubscribe_recorda_line_user', { p_line_user_id: userId });
        return;
      }
      if (event.type !== 'message' || event.message?.type !== 'text') return;

      const messageText = event.message.text;

      if (['配信停止', '停止', 'unsubscribe'].includes(messageText.trim().toLowerCase())) {
        await sendLineMessage(userId, replyToken, [{ type: 'text', text: '配信を停止しました。再開をご希望の場合は、登録フォームからもう一度同意してください。' }]);
        await supabaseRpc('unsubscribe_recorda_line_user', { p_line_user_id: userId });
        return;
      }

      if (isRegistrationRequest(messageText)) {
        await sendRegistrationLink(userId, '', replyToken);
        return;
      }

      if (isSurveyRequest(messageText)) {
        await sendSurveyLink(userId, replyToken);
        return;
      }

      if (['謝礼付きアンケート', '謝礼付きアンケートに参加'].includes(messageText.trim())) {
        await sendPaidSurveyLink(userId, replyToken);
        return;
      }

      if (isNormal50SurveyRequest(messageText)) {
        await sendNormal50SurveyLink(userId, replyToken);
        return;
      }

      if (isPointRedemptionRequest(messageText)) {
        await sendPointRedemptionReply(userId, replyToken);
        return;
      }

      if (isBusinessConsultationRequest(messageText)) {
        await sendLineMessage(userId, replyToken, [{
          type: 'text',
          text: 'ご相談ありがとうございます。現在のお困りごとや、減らしたい手作業をこのままメッセージでお送りください。内容を確認してご連絡します。'
        }]);
        return;
      }

      await sendGeneralMessageReply(userId, replyToken);
    } catch (error) {
      console.error('LINE webhook event handling failed:', error);
    }
  }));
  return json(res, 200, { ok: true });
};

module.exports.config = { api: { bodyParser: false } };
module.exports.isSurveyRequest = isSurveyRequest;
module.exports.isPointRedemptionRequest = isPointRedemptionRequest;
module.exports.isNormal50SurveyRequest = isNormal50SurveyRequest;
module.exports.isRegistrationRequest = isRegistrationRequest;
module.exports.isBusinessConsultationRequest = isBusinessConsultationRequest;
