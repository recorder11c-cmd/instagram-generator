const crypto = require('crypto');
const { json, linePush, signRegistrationToken, supabaseRpc } = require('./_recorda');

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function sendRegistrationLink(userId) {
  const token = signRegistrationToken(userId);
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/[\r\n\u2028\u2029]/g, '').trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('PUBLIC_BASE_URL is not configured');
  await linePush(userId, [{
    type: 'text',
    text: `次のフォームで、ご希望の情報を選んでください。\n${baseUrl}/recorda/?token=${encodeURIComponent(token)}`
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
  const token = signRegistrationToken(userId);
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/[\r\n\u2028\u2029]/g, '').trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('PUBLIC_BASE_URL is not configured');
  await linePush(userId, [{
    type: 'text',
    text: `20名限定・300ポイントの謝礼付きアンケートです（約2分）。ポイント付与予定日は2026年7月10日です。\n${baseUrl}/recorda/survey.html?token=${encodeURIComponent(token)}&survey=line-paid-pilot-2026-07`
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
