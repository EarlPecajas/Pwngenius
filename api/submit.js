const crypto = require('crypto');
const { getAuthenticatedUser, sendError, supabaseRequest } = require('./_supabase');

function hashFlag(flag) {
  return crypto.createHash('sha256').update(flag, 'utf8').digest('hex');
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getAuthenticatedUser(request);
    const challengeId = typeof request.body?.challengeId === 'string'
      ? request.body.challengeId.trim()
      : '';
    const flag = typeof request.body?.flag === 'string' ? request.body.flag.trim() : '';
    if (!challengeId || !flag) return response.status(400).json({ correct: false });

    const previousCorrect = await supabaseRequest(
      `submissions?user_id=eq.${encodeURIComponent(user.id)}&challenge_id=eq.${encodeURIComponent(challengeId)}&correct=eq.true&select=id&limit=1`
    );
    if (previousCorrect.length) {
      return response.status(200).json({ correct: true, alreadySolved: true });
    }

    const submittedHash = hashFlag(flag);
    const challenges = await supabaseRequest(
      `challenges?id=eq.${encodeURIComponent(challengeId)}&select=id,flag_hash&limit=1`
    );
    const correct = challenges.length === 1 && submittedHash === challenges[0].flag_hash;

    await supabaseRequest('submissions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        challenge_id: challengeId,
        submitted_hash: submittedHash,
        correct,
        user_id: user.id
      })
    });

    return response.status(200).json({ correct });
  } catch (error) {
    return sendError(response, error);
  }
};
