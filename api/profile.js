const { getAuthenticatedUser, sendError, supabaseRequest } = require('./_supabase');

module.exports = async function handler(request, response) {
  try {
    const user = await getAuthenticatedUser(request);
    if (request.method === 'GET') {
      const profiles = await supabaseRequest(
        `profiles?id=eq.${encodeURIComponent(user.id)}&select=full_name,username,email,role&limit=1`
      );
      let profile = profiles[0];
      if (!profile) {
        const preferredUsername = (user.user_metadata?.username
          || user.email?.split('@')[0]
          || 'user').toString();
        const fallbackUsername = `${preferredUsername}-${user.id.slice(0, 8)}`;
        const created = await supabaseRequest('profiles', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || '',
            username: fallbackUsername
          })
        });
        profile = created?.[0];
      }
      const submissions = await supabaseRequest(
        `submissions?user_id=eq.${encodeURIComponent(user.id)}&correct=eq.true&select=challenge_id`
      );
      const challenges = await supabaseRequest('challenges?select=id,points,category');
      const challengeDetails = new Map(challenges.map((challenge) => [
        challenge.id,
        { points: challenge.points, category: challenge.category || 'General' }
      ]));
      const solvedIds = new Set(submissions.map((submission) => submission.challenge_id));
      const totalScore = [...solvedIds].reduce((total, challengeId) => (
        total + (challengeDetails.get(challengeId)?.points || 0)
      ), 0);
      const categoryBreakdown = {};
      [...solvedIds].forEach((challengeId) => {
        const category = challengeDetails.get(challengeId)?.category || 'General';
        categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
      });
      return response.status(200).json({
        profile: profile || {
          full_name: user.user_metadata?.full_name || '',
          username: user.user_metadata?.username || user.email?.split('@')[0] || '',
          email: user.email || '',
          role: 'user'
        },
        totalScore,
        solvedCount: solvedIds.size,
        categoryBreakdown
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
