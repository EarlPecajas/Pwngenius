const { requireAdmin, sendError, supabaseRequest } = require('../_supabase');

module.exports = async function handler(request, response) {
  try {
    await requireAdmin(request);
    if (request.method === 'GET') {
      const settings = await supabaseRequest(
        'site_settings?key=eq.challenges_locked&select=value&limit=1'
      );
      return response.status(200).json({ locked: settings[0]?.value !== 'false' });
    }

    if (request.method === 'PATCH') {
      const locked = request.body?.locked === true;
      await supabaseRequest('site_settings?key=eq.challenges_locked', {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ value: String(locked) })
      });
      return response.status(200).json({ locked });
    }

    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return sendError(response, error);
  }
};
