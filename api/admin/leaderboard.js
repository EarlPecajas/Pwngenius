const { requireAdmin, sendError, supabaseRequest } = require('../_supabase');

module.exports = async function handler(request, response) {
  try {
    await requireAdmin(request);
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
