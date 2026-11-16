const { getAuthenticatedUser, sendError, supabaseRequest } = require('./_supabase');

module.exports = async function handler(request, response) {
  try {
    const user = await getAuthenticatedUser(request);
    if (request.method === 'GET') {
      const profiles = await supabaseRequest(
        `profiles?id=eq.${encodeURIComponent(user.id)}&select=full_name,username,email,role&limit=1`
      );
      const submissions = await supabaseRequest(
        `submissions?user_id=eq.${encodeURIComponent(user.id)}&correct=eq.true&select=challenge_id`
      );
      const challenges = await supabaseRequest('challenges?select=id,points');
      const points = new Map(challenges.map((challenge) => [challenge.id, challenge.points]));
      const totalScore = submissions.reduce((total, submission) => (
        total + (points.get(submission.challenge_id) || 0)
      ), 0);
      return response.status(200).json({
        profile: profiles[0],
        totalScore,
        solvedCount: submissions.length
      });
    }

    if (request.method === 'PATCH') {
      const fullName = typeof request.body?.full_name === 'string'
        ? request.body.full_name.trim()
        : '';
      const username = typeof request.body?.username === 'string'
        ? request.body.username.trim()
        : '';
      if (!fullName || !username) {
        return response.status(400).json({ error: 'Full name and username are required' });
      }
      const updated = await supabaseRequest(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ full_name: fullName, username })
      });
      return response.status(200).json({ profile: updated?.[0] || null });
    }

    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return sendError(response, error);
  }
};
