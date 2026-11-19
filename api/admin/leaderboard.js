const { requireAdmin, sendError, supabaseRequest } = require('../_supabase');

module.exports = async function handler(request, response) {
  try {
    await requireAdmin(request);
    const action = request.query?.action || '';

    if (action === 'settings' && request.method === 'GET') {
      const settings = await supabaseRequest(
        'site_settings?key=eq.leaderboard_hidden&select=value&limit=1'
      );
      return response.status(200).json({ hidden: settings[0]?.value === 'true' });
    }

    if (action === 'settings' && request.method === 'PATCH') {
      const hidden = request.body?.hidden === true;
      await supabaseRequest('site_settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: 'leaderboard_hidden', value: String(hidden) })
      });
      return response.status(200).json({ hidden });
    }

    if (action === 'reset' && request.method === 'DELETE') {
      await supabaseRequest('submissions?correct=eq.true', { method: 'DELETE' });
      return response.status(200).json({ success: true });
    }

    if (action === 'solves' && request.method === 'GET') {
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
    }

    if (request.method !== 'GET') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const [profiles, submissions, challenges] = await Promise.all([
      supabaseRequest('profiles?select=id,full_name,username'),
      supabaseRequest('submissions?correct=eq.true&select=user_id,challenge_id'),
      supabaseRequest('challenges?select=id,points')
    ]);
    const points = new Map(challenges.map((challenge) => [challenge.id, challenge.points]));
    const scores = new Map();
    submissions.forEach((submission) => {
      if (!submission.user_id) return;
      if (!scores.has(submission.user_id)) scores.set(submission.user_id, new Set());
      scores.get(submission.user_id).add(submission.challenge_id);
    });

    const leaderboard = profiles.map((profile) => {
      const solved = scores.get(profile.id) || new Set();
      const score = [...solved].reduce((total, challengeId) => (
        total + (points.get(challengeId) || 0)
      ), 0);
      return {
        fullName: profile.full_name,
        username: profile.username,
        solvedCount: solved.size,
        score
      };
    }).sort((left, right) => right.score - left.score || right.solvedCount - left.solvedCount);

    return response.status(200).json({ leaderboard });
  } catch (error) {
    return sendError(response, error);
  }
};
