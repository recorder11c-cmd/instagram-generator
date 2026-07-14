const crypto = require('crypto');
const { json, linePush, signRegistrationToken, supabaseRpc } = require('./_recorda');

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function sendRegistrationLink(userId, intent = '') {
  const token = signRegistrationToken(userId, intent);
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/[\r\n\u2028\u2029]/g, '').trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('PUBLIC_BASE_URL is not configured');
  const intro = intent === 'paid'
    ? '先にモニター登録を完了してください。登録後、今回の謝礼付きアンケートをご案内します。'
    : '次のフォームで、ご希望の情報を選んでください。';
  await linePush(userId, [{
    type: 'text',
    text: `${intro}\n${baseUrl}/recorda/?token=${encodeURIComponent(token)}`
  }]);
}

async function sendSurveyLink(userId) {
  const token = signRegistrationToken(userId);
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/[\r\n\u2028\u2029]/g, '').trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('PUBLIC_BASE_URL is not configured');
  await linePush(userId, [{
    type: 'text',
    text: `テストアンケートはこちらです（約2分・謝礼なし）。\n${baseUrl}/recorda/survey.html?token=${encodeURIComponent(token)}`
  }]);
}

async function sendPaidSurveyLink(userId) {
  const entry = await supabaseRpc('request_recorda_survey_entry', {
    p_survey_id: 'line-paid-pilot-2026-07',
    p_line_user_id: userId
  });
  if (entry?.status === 'registration_required') {
    await sendRegistrationLink(userId, 'paid');
    return;
  }
  if (entry?.status === 'not_open') {
    await linePush(userId, [{
      type: 'text',
      text: '謝礼付きアンケートはまだ募集開始前です。募集開始までしばらくお待ちください。'
    }]);
    return;
  }
  if (entry?.status === 'full') {
    await linePush(userId, [{
      type: 'text',
      text: 'ご応募ありがとうございます。今回は定員に達したため受付を終了しました。次回の募集をお待ちください。'
    }]);
    return;
  }
  if (entry?.status !== 'open') {
    await linePush(userId, [{
      type: 'text',
      text: 'このアンケートは受付を終了しました。次回の募集をお待ちください。'
    }]);
    return;
  }
  const token = signRegistrationToken(userId);
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/[\r\n\u2028\u2029]/g, '').trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('PUBLIC_BASE_URL is not configured');
  await linePush(userId, [{
    type: 'text',
    text: `20名限定・300ポイントの謝礼付きアンケートです（約3分）。参加条件をご確認ください。ポイント付与予定日は2026年7月10日です。\n${baseUrl}/recorda/paid-pilot.html?token=${encodeURIComponent(token)}`
  }]);
}

function isSurveyRequest(text) {
  const normalized = String(text || '')
    .normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/[!！?？。、．.]+$/g, '');
  return [
    'アンケート',
    'アンケート参加',
    'アンケートに参加',
    'アンケートに参加する'
  ].includes(normalized);
}

function isPointRedemptionRequest(text) {
  const normalized = String(text || '')
    .normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/[!！?？。、．.]+$/g, '');
  return [
    'ポイント交換',
    'ポイントを交換',
    'ポイント交換申請',
    'ギフト交換',
    'デジタルギフト交換'
  ].includes(normalized);
}

async function sendPointRedemptionReply(userId) {
  const result = await supabaseRpc('request_recorda_point_redemption', {
    p_line_user_id: userId
  });
  if (result?.status === 'registration_required') {
    await linePush(userId, [{
      type: 'text',
      text: 'ポイント交換には、先にモニター登録が必要です。登録フォームをご案内します。'
    }]);
    await sendRegistrationLink(userId);
    return;
  }
  if (result?.status === 'insufficient') {
    const balance = Number(result.balance || 0);
    const remaining = Number(result.remaining_points || 0);
    await linePush(userId, [{
      type: 'text',
      text: `現在のポイントは${balance}ポイントです。\nデジタルギフトへの交換は500ポイントから受け付けています。あと${remaining}ポイントで交換できます。`
    }]);
    return;
  }
  if (result?.status === 'already_requested') {
    await linePush(userId, [{
      type: 'text',
      text: 'ポイント交換申請はすでに受け付けています。確認後、デジタルギフトの受け取りリンクをこのトークでお送りします。'
    }]);
    return;
  }
  if (result?.status === 'accepted') {
    await linePush(userId, [{
      type: 'text',
      text: '500ポイントの交換申請を受け付けました。確認後、デジタルギフトの受け取りリンクをこのトークでお送りします。'
    }]);
    return;
  }
  await linePush(userId, [{
    type: 'text',
    text: 'ポイント交換の受付状況を確認できませんでした。時間をおいてもう一度お試しください。'
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
    const userId = event.source?.userId;
    if (!userId) return;
    if (event.type === 'follow') {
      await linePush(userId, [{ type: 'text', text: '友だち追加ありがとうございます。' }]);
      await sendRegistrationLink(userId);
    }
    if (event.type === 'unfollow') {
      await supabaseRpc('unsubscribe_recorda_line_user', { p_line_user_id: userId });
    }
    if (event.type === 'message' && event.message?.type === 'text' &&
        ['配信停止', '停止', 'unsubscribe'].includes(event.message.text.trim().toLowerCase())) {
      await linePush(userId, [{ type: 'text', text: '配信を停止しました。再開をご希望の場合は、登録フォームからもう一度同意してください。' }]);
      await supabaseRpc('unsubscribe_recorda_line_user', { p_line_user_id: userId });
    }
    if (event.type === 'message' && event.message?.type === 'text' &&
        ['モニター登録', '登録フォーム'].includes(event.message.text.trim())) {
      await sendRegistrationLink(userId);
    }
    if (event.type === 'message' && event.message?.type === 'text' &&
        isSurveyRequest(event.message.text)) {
      await sendSurveyLink(userId);
    }
    if (event.type === 'message' && event.message?.type === 'text' &&
        ['謝礼付きアンケート', '謝礼付きアンケートに参加'].includes(event.message.text.trim())) {
      await sendPaidSurveyLink(userId);
    }
    if (event.type === 'message' && event.message?.type === 'text' &&
        isPointRedemptionRequest(event.message.text)) {
      await sendPointRedemptionReply(userId);
    }
    if (event.type === 'message' && event.message?.type === 'text' &&
        event.message.text.trim() === '業務改善・AI相談') {
      await linePush(userId, [{
        type: 'text',
        text: 'ご相談ありがとうございます。現在のお困りごとや、減らしたい手作業をこのままメッセージでお送りください。内容を確認してご連絡します。'
      }]);
    }
  }));
  return json(res, 200, { ok: true });
};

module.exports.config = { api: { bodyParser: false } };
module.exports.isSurveyRequest = isSurveyRequest;
module.exports.isPointRedemptionRequest = isPointRedemptionRequest;
