const crypto = require('crypto');
const { requireAdmin, sendError, supabaseRequest, getAuthenticatedUser } = require('./_supabase');

function hashFlag(flag) {
  return crypto.createHash('sha256').update(flag, 'utf8').digest('hex');
}

module.exports = async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      await getAuthenticatedUser(request);
      const challenges = await supabaseRequest(
        'challenges?select=id,name,category,difficulty,description,hint,points,created_at&order=created_at.desc'
      );
      return response.status(200).json({ challenges });
    }

    if (request.method === 'POST') {
      await requireAdmin(request);
      const body = request.body || {};
      const required = ['title', 'category', 'difficulty', 'description', 'hint', 'flag'];
      if (required.some((field) => typeof body[field] !== 'string' || !body[field].trim())) {
        return response.status(400).json({ error: 'All challenge fields are required' });
      }
      const id = body.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const created = await supabaseRequest('challenges', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          id,
          name: body.title.trim(),
          category: body.category.trim(),
          difficulty: body.difficulty.trim(),
          description: body.description.trim(),
          hint: body.hint.trim(),
          flag_hash: hashFlag(body.flag.trim()),
          points: Number.isInteger(body.points) ? body.points : 100
        })
      });
      return response.status(201).json({ challenge: created?.[0] || null });
    }

    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return sendError(response, error);
  }
};
