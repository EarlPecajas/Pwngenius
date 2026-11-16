const crypto = require('crypto');

const challengeId = 'first';

function hashFlag(flag) {
  return crypto.createHash('sha256').update(flag, 'utf8').digest('hex');
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status}`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const flag = typeof request.body?.flag === 'string' ? request.body.flag.trim() : '';
  if (!flag) return response.status(400).json({ correct: false });

  try {
    const submittedHash = hashFlag(flag);
    const challenges = await supabaseRequest(
      `challenges?id=eq.${challengeId}&select=id,flag_hash&limit=1`
    );
    const correct = challenges.length === 1 && submittedHash === challenges[0].flag_hash;

    await supabaseRequest('submissions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ challenge_id: challengeId, submitted_hash: submittedHash, correct })
    });

    return response.status(200).json({ correct });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Submission service unavailable' });
  }
};
