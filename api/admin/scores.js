const { requireAdmin, sendError, supabaseRequest } = require('../_supabase');

module.exports = async function handler(request, response) {
  try {
    await requireAdmin(request);
    if (request.method !== 'DELETE') {
      return response.status(405).json({ error: 'Method not allowed' });
    }
    await supabaseRequest('submissions?correct=eq.true', { method: 'DELETE' });
    return response.status(200).json({ success: true });
  } catch (error) {
    return sendError(response, error);
  }
};
