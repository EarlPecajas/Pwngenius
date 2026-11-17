const crypto = require('crypto');
const { requireAdmin, sendError, supabaseRequest, getAuthenticatedUser } = require('./_supabase');

function hashFlag(flag) {
  return crypto.createHash('sha256').update(flag, 'utf8').digest('hex');
}

module.exports = async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      const user = await getAuthenticatedUser(request);
      const profiles = await supabaseRequest(
        `profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`
      );
      const isAdmin = profiles[0]?.role === 'admin';
      const settings = await supabaseRequest(
        'site_settings?key=eq.challenges_locked&select=value&limit=1'
      );
      if (!isAdmin && settings[0]?.value !== 'false') {
        return response.status(200).json({ locked: true, challenges: [] });
      }
      const [challenges, submissions] = await Promise.all([
        supabaseRequest(
        'challenges?select=id,name,category,difficulty,description,hint,points,created_at&order=created_at.desc'
        ),
        supabaseRequest(
          `submissions?user_id=eq.${encodeURIComponent(user.id)}&correct=eq.true&select=challenge_id`
        )
      ]);
      const solvedIds = new Set(submissions.map((submission) => submission.challenge_id));
      return response.status(200).json({
        locked: !isAdmin && settings[0]?.value !== 'false',
        challenges: challenges.map((challenge) => ({
          ...challenge,
          solved: solvedIds.has(challenge.id)
        }))
      });
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

    if (request.method === 'PATCH') {
      await requireAdmin(request);
      const body = request.body || {};
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const fields = ['title', 'category', 'difficulty', 'description', 'hint'];
      if (!id || fields.some((field) => typeof body[field] !== 'string' || !body[field].trim())) {
        return response.status(400).json({ error: 'Challenge ID and all challenge fields are required' });
      }

      const update = {
        name: body.title.trim(),
        category: body.category.trim(),
        difficulty: body.difficulty.trim(),
        description: body.description.trim(),
        hint: body.hint.trim()
      };
      if (typeof body.flag === 'string' && body.flag.trim()) {
        update.flag_hash = hashFlag(body.flag.trim());
      }
      if (Number.isInteger(body.points)) update.points = body.points;

      const updated = await supabaseRequest(`challenges?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(update)
      });
      return response.status(200).json({ challenge: updated?.[0] || null });
    }

    if (request.method === 'DELETE') {
      await requireAdmin(request);
      const id = typeof request.body?.id === 'string' ? request.body.id.trim() : '';
      if (!id) return response.status(400).json({ error: 'Challenge ID is required' });
      await supabaseRequest(`submissions?challenge_id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      await supabaseRequest(`challenges?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return response.status(200).json({ success: true });
    }

    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return sendError(response, error);
  }
};
