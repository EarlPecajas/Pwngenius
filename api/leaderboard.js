const { getAuthenticatedUser, sendError, supabaseRequest } = require('./_supabase');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getAuthenticatedUser(request);
    const visibility = await supabaseRequest(
      'site_settings?key=eq.leaderboard_hidden&select=value&limit=1'
    );
    if (visibility[0]?.value === 'true') {
      return response.status(200).json({
        leaderboard: [],
        currentUsername: '',
        hidden: true
      });
    }
    const [profiles, submissions, challenges] = await Promise.all([
      supabaseRequest('profiles?select=id,username'),
      supabaseRequest('submissions?correct=eq.true&select=user_id,challenge_id,created_at'),
      supabaseRequest('challenges?select=id,points')
    ]);
    const currentProfile = profiles.find((profile) => profile.id === user.id);

    const points = new Map(challenges.map((challenge) => [challenge.id, challenge.points]));
    const solved = new Map();
    submissions.forEach((submission) => {
      if (!submission.user_id) return;
      if (!solved.has(submission.user_id)) solved.set(submission.user_id, new Set());
      solved.get(submission.user_id).add(submission.challenge_id);
    });
    const firstSolveByChallenge = new Map();
    submissions.forEach((submission) => {
      if (!submission.user_id || !submission.created_at) return;
      const key = `${submission.user_id}:${submission.challenge_id}`;
      const current = firstSolveByChallenge.get(key);
      if (!current || new Date(submission.created_at) < new Date(current)) {
        firstSolveByChallenge.set(key, submission.created_at);
      }
    });

    const leaderboard = profiles.map((profile) => {
      const solvedIds = solved.get(profile.id) || new Set();
      const score = [...solvedIds].reduce((total, challengeId) => (
        total + (points.get(challengeId) || 0)
      ), 0);
      const completionTimes = [...solvedIds]
        .map((challengeId) => firstSolveByChallenge.get(`${profile.id}:${challengeId}`))
        .filter(Boolean)
        .map((timestamp) => new Date(timestamp).getTime());
      const completionAt = completionTimes.length ? Math.max(...completionTimes) : null;
      return {
        username: profile.username,
        score,
        completionAt: completionAt ? new Date(completionAt).toISOString() : null
      };
    }).sort((left, right) => right.score - left.score
      || (left.completionAt ? new Date(left.completionAt).getTime() : Number.POSITIVE_INFINITY)
        - (right.completionAt ? new Date(right.completionAt).getTime() : Number.POSITIVE_INFINITY)
      || left.username.localeCompare(right.username));

    return response.status(200).json({
      leaderboard,
      currentUsername: currentProfile?.username || '',
      hidden: false
    });
  } catch (error) {
    return sendError(response, error);
  }
};
