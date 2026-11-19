const { requireAdmin, sendError, supabaseRequest } = require('../_supabase');

module.exports = async function handler(request, response) {
  try {
    await requireAdmin(request);
    if (request.method !== 'GET') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const [submissions, challenges, profiles] = await Promise.all([
      supabaseRequest('submissions?correct=eq.true&select=user_id,challenge_id'),
      supabaseRequest('challenges?select=id,name,category,difficulty'),
      supabaseRequest('profiles?select=id,full_name,username')
    ]);

    const challengeMap = new Map(challenges.map((challenge) => [challenge.id, challenge]));
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const categoryFilter = typeof request.query?.category === 'string' ? request.query.category : '';
    const difficultyFilter = typeof request.query?.difficulty === 'string' ? request.query.difficulty : '';

    const byUser = new Map();
    submissions.forEach((submission) => {
      const challenge = challengeMap.get(submission.challenge_id);
      if (!challenge) return;
      if (categoryFilter && challenge.category !== categoryFilter) return;
      if (difficultyFilter && challenge.difficulty !== difficultyFilter) return;
      const profile = profileMap.get(submission.user_id);
      const label = profile?.full_name || profile?.username || 'Unknown user';
      byUser.set(label, (byUser.get(label) || 0) + 1);
    });

    const data = [...byUser.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

    return response.status(200).json({ data });
  } catch (error) {
    return sendError(response, error);
  }
};
