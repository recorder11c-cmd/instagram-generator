const crypto = require('crypto');
const { json, linePush, signRegistrationToken, supabaseRpc } = require('./_recorda');

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
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
      const token = signRegistrationToken(userId);
      const baseUrl = process.env.PUBLIC_BASE_URL;
      if (!baseUrl) throw new Error('PUBLIC_BASE_URL is not configured');
      await linePush(userId, [{
        type: 'text',
        text: `友だち追加ありがとうございます。\n次のフォームで、ご希望の情報を選んでください。\n${baseUrl}/recorda/?token=${encodeURIComponent(token)}`
      }]);
    }
    if (event.type === 'unfollow') {
      await supabaseRpc('unsubscribe_recorda_line_user', { p_line_user_id: userId });
    }
    if (event.type === 'message' && event.message?.type === 'text' &&
        ['配信停止', '停止', 'unsubscribe'].includes(event.message.text.trim().toLowerCase())) {
      await linePush(userId, [{ type: 'text', text: '配信を停止しました。再開をご希望の場合は、登録フォームからもう一度同意してください。' }]);
      await supabaseRpc('unsubscribe_recorda_line_user', { p_line_user_id: userId });
    }
  }));
  return json(res, 200, { ok: true });
};

module.exports.config = { api: { bodyParser: false } };
