const { requireAdmin, sendError, supabaseRequest } = require('../_supabase');

module.exports = async function handler(request, response) {
  try {
    await requireAdmin(request);
    if (request.method === 'GET') {
      const settings = await supabaseRequest(
        'site_settings?key=eq.leaderboard_hidden&select=value&limit=1'
      );
      return response.status(200).json({ hidden: settings[0]?.value === 'true' });
    }
    if (request.method === 'PATCH') {
      const hidden = request.body?.hidden === true;
      await supabaseRequest('site_settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: 'leaderboard_hidden', value: String(hidden) })
      });
      return response.status(200).json({ hidden });
    }
    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return sendError(response, error);
  }
};
