const { json, linePush, supabaseRpc } = require('./_recorda');

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return json(res, 401, { error: 'Unauthorized' });
  }
  try {
    const jobs = await supabaseRpc('claim_recorda_messages', { p_limit: 50 });
    const results = [];
    for (const job of jobs || []) {
      try {
        await linePush(job.line_user_id, [{ type: 'text', text: job.message_text }]);
        await supabaseRpc('finish_recorda_message', { p_job_id: job.id, p_success: true, p_error: null });
        results.push({ id: job.id, ok: true });
      } catch (error) {
        await supabaseRpc('finish_recorda_message', { p_job_id: job.id, p_success: false, p_error: String(error.message).slice(0, 500) });
        results.push({ id: job.id, ok: false });
      }
    }
    return json(res, 200, { processed: results.length, results });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'Dispatch failed' });
  }
};
