const { getAuthenticatedUser, sendError, supabaseRequest } = require('./_supabase');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await getAuthenticatedUser(request);
    const [profiles, submissions, challenges] = await Promise.all([
      supabaseRequest('profiles?select=id,username'),
      supabaseRequest('submissions?correct=eq.true&select=user_id,challenge_id'),
      supabaseRequest('challenges?select=id,points')
    ]);

    const points = new Map(challenges.map((challenge) => [challenge.id, challenge.points]));
    const solved = new Map();
    submissions.forEach((submission) => {
      if (!submission.user_id) return;
      if (!solved.has(submission.user_id)) solved.set(submission.user_id, new Set());
      solved.get(submission.user_id).add(submission.challenge_id);
    });

    const leaderboard = profiles.map((profile) => {
      const solvedIds = solved.get(profile.id) || new Set();
      const score = [...solvedIds].reduce((total, challengeId) => (
        total + (points.get(challengeId) || 0)
      ), 0);
      return {
        username: profile.username,
        score
      };
    }).sort((left, right) => right.score - left.score
      || left.username.localeCompare(right.username));

    return response.status(200).json({ leaderboard });
  } catch (error) {
    return sendError(response, error);
  }
};
