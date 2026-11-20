const crypto = require('crypto');
const { getAuthenticatedUser, sendError, supabaseRequest } = require('./_supabase');

function hashFlag(flag) {
  if (!process.env.FLAG_HMAC_SECRET) {
    throw new Error('FLAG_HMAC_SECRET is not configured');
  }
  return crypto.createHmac('sha256', process.env.FLAG_HMAC_SECRET)
    .update(flag, 'utf8')
    .digest('hex');
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

    const [settings, challengeRows, previousCorrect, limitSettings] = await Promise.all([
      supabaseRequest('site_settings?key=eq.challenges_locked&select=value&limit=1'),
      supabaseRequest(`challenges?id=eq.${encodeURIComponent(challengeId)}&select=id,flag_hash,locked&limit=1`),
      supabaseRequest(`submissions?user_id=eq.${encodeURIComponent(user.id)}&challenge_id=eq.${encodeURIComponent(challengeId)}&correct=eq.true&select=id&limit=1`),
      supabaseRequest(`site_settings?key=eq.${encodeURIComponent(`challenge_submission_limit:${challengeId}`)}&select=value&limit=1`)
    ]);
    if (settings[0]?.value !== 'false') {
      return response.status(423).json({ error: 'Challenges are locked' });
    }
    if (challengeRows[0]?.locked === true) {
      return response.status(423).json({ error: 'This challenge is locked' });
    }
    if (previousCorrect.length) {
      return response.status(200).json({ correct: true, alreadySolved: true });
    }

    const submittedHash = hashFlag(flag);
    const submissionLimitValue = Number(limitSettings[0]?.value);
    const submissionLimit = Number.isInteger(submissionLimitValue) && submissionLimitValue >= 1
      ? submissionLimitValue
      : null;
    if (Number.isInteger(submissionLimit) && submissionLimit >= 1) {
      const attempts = await supabaseRequest(
        `submissions?user_id=eq.${encodeURIComponent(user.id)}&challenge_id=eq.${encodeURIComponent(challengeId)}&select=id`
      );
      if (attempts.length >= submissionLimit) {
        return response.status(429).json({ error: 'Submission limit reached', correct: false });
      }
    }
    const correct = challengeRows.length === 1 && submittedHash === challengeRows[0].flag_hash;

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
