const crypto = require('crypto');
const { requireAdmin, sendError, supabaseRequest, supabaseStorageRequest, getAuthenticatedUser } = require('./_supabase');

function hashFlag(flag) {
  if (!process.env.FLAG_HMAC_SECRET) {
    throw new Error('FLAG_HMAC_SECRET is not configured');
  }
  return crypto.createHmac('sha256', process.env.FLAG_HMAC_SECRET)
    .update(flag.trim(), 'utf8')
    .digest('hex');
}

const DIFFICULTY_POINTS = {
  Easy: [20, 30],
  Medium: [50, 70],
  Hard: [100],
  'Super Hard': [200]
};

function validateDifficultyPoints(difficulty, points) {
  if (!DIFFICULTY_POINTS[difficulty]) {
    throw new Error('Invalid difficulty');
  }
  if (!DIFFICULTY_POINTS[difficulty].includes(points)) {
    throw new Error(`Invalid points for ${difficulty}`);
  }
}

function submissionLimitKey(challengeId) {
  return `challenge_submission_limit:${challengeId}`;
}

function normalizeSubmissionLimit(value) {
  return Number.isInteger(value) && value >= 1 ? value : null;
}

async function getSubmissionLimit(challengeId) {
  const settings = await supabaseRequest(
    `site_settings?key=eq.${encodeURIComponent(submissionLimitKey(challengeId))}&select=value&limit=1`
  );
  const limit = Number(settings[0]?.value);
  return Number.isInteger(limit) && limit >= 1 ? limit : null;
}

async function setSubmissionLimit(challengeId, limit) {
  if (limit === null) {
    await supabaseRequest(
      `site_settings?key=eq.${encodeURIComponent(submissionLimitKey(challengeId))}`,
      { method: 'DELETE' }
    );
    return;
  }
  await supabaseRequest('site_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: submissionLimitKey(challengeId), value: String(limit) })
  });
}

function challengeFilesKey(challengeId) {
  return `challenge_files:${challengeId}`;
}

async function getChallengeFiles(challengeId) {
  const settings = await supabaseRequest(
    `site_settings?key=eq.${encodeURIComponent(challengeFilesKey(challengeId))}&select=value&limit=1`
  );
  try {
    return settings[0]?.value ? JSON.parse(settings[0].value) : [];
  } catch {
    return [];
  }
}

function safeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'challenge-file';
}

async function uploadChallengeFiles(challengeId, files) {
  if (!Array.isArray(files) || !files.length) return [];
  try {
    await supabaseStorageRequest('bucket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'challenge-files', name: 'challenge-files', public: true })
    });
  } catch (error) {
    if (!String(error.message).includes('409') && !String(error.message).includes('already')) throw error;
  }

  const uploadedFiles = [];
  for (const file of files) {
    if (!file?.name || typeof file.data !== 'string') {
      throw new Error('Invalid challenge file');
    }
    const match = file.data.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error(`Invalid file data for ${file.name}`);
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) throw new Error(`Empty file: ${file.name}`);
    if (buffer.length > 4 * 1024 * 1024) {
      throw new Error(`File exceeds 4 MB: ${file.name}`);
    }
    const fileName = `${Date.now()}-${safeFileName(file.name)}`;
    await supabaseStorageRequest(
      `object/challenge-files/${encodeURIComponent(challengeId)}/${encodeURIComponent(fileName)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': match[1] || file.type || 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: buffer
      }
    );
    uploadedFiles.push({
      name: file.name,
      url: `${process.env.SUPABASE_URL}/storage/v1/object/public/challenge-files/${encodeURIComponent(challengeId)}/${encodeURIComponent(fileName)}`
    });
  }
  return uploadedFiles;
}

async function setChallengeFiles(challengeId, files) {
  await supabaseRequest('site_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      key: challengeFilesKey(challengeId),
      value: JSON.stringify(files)
    })
  });
}

module.exports = async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      const user = await getAuthenticatedUser(request);
      const profiles = await supabaseRequest(
        `profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`
      );
      const isAdmin = profiles[0]?.role === 'admin';
      const settings = await supabaseRequest(
        'site_settings?key=eq.challenges_locked&select=value&limit=1'
      );
      if (!isAdmin && settings[0]?.value !== 'false') {
        return response.status(200).json({ locked: true, challenges: [] });
      }
      const challenges = await supabaseRequest(
        'challenges?select=id,name,category,difficulty,description,hint,points,created_at&order=created_at.desc'
      );
      const [submissions, limitSettings, fileSettings] = await Promise.all([
        supabaseRequest(`submissions?user_id=eq.${encodeURIComponent(user.id)}&select=challenge_id,correct`),
        supabaseRequest('site_settings?key=like.challenge_submission_limit:*&select=key,value'),
        supabaseRequest('site_settings?key=like.challenge_files:*&select=key,value')
      ]);
      const solvedIds = new Set(
        submissions.filter((submission) => submission.correct).map((submission) => submission.challenge_id)
      );
      const attemptCounts = new Map();
      submissions.forEach((submission) => {
        attemptCounts.set(
          submission.challenge_id,
          (attemptCounts.get(submission.challenge_id) || 0) + 1
        );
      });
      const limitsByChallenge = new Map(limitSettings.map((setting) => [
        setting.key.slice('challenge_submission_limit:'.length),
        normalizeSubmissionLimit(Number(setting.value))
      ]));
      const filesByChallenge = new Map(fileSettings.map((setting) => {
        try {
          return [setting.key.slice('challenge_files:'.length), JSON.parse(setting.value)];
        } catch {
          return [setting.key.slice('challenge_files:'.length), []];
        }
      }));
      return response.status(200).json({
        locked: !isAdmin && settings[0]?.value !== 'false',
        challenges: challenges.map((challenge) => ({
          ...challenge,
          solved: solvedIds.has(challenge.id),
          submissionLimit: limitsByChallenge.get(challenge.id) || null,
          submissionCount: attemptCounts.get(challenge.id) || 0,
          files: filesByChallenge.get(challenge.id) || []
        }))
      });
    }

    if (request.method === 'POST') {
      await requireAdmin(request);
      const body = request.body || {};
      const required = ['title', 'category', 'difficulty', 'description', 'hint', 'flag'];
      if (required.some((field) => typeof body[field] !== 'string' || !body[field].trim())) {
        return response.status(400).json({ error: 'All challenge fields are required' });
      }
      const id = body.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const points = Number.isInteger(body.points) ? body.points : 100;
      validateDifficultyPoints(body.difficulty.trim(), points);
      const challengeData = {
          id,
          name: body.title.trim(),
          category: body.category.trim(),
          difficulty: body.difficulty.trim(),
          description: body.description.trim(),
          hint: body.hint.trim(),
          flag_hash: hashFlag(body.flag.trim()),
          points,
          submission_limit: body.submission_limit === null
            ? null
            : (Number.isInteger(body.submission_limit) && body.submission_limit >= 1 ? body.submission_limit : null)
      };
      let created;
      const { submission_limit, ...compatibleChallengeData } = challengeData;
      created = await supabaseRequest('challenges', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(compatibleChallengeData)
      });
      await setSubmissionLimit(
        id,
        normalizeSubmissionLimit(body.submission_limit)
      );
      const uploadedFiles = await uploadChallengeFiles(id, body.challenge_files);
      await setChallengeFiles(id, uploadedFiles);
      return response.status(201).json({ challenge: created?.[0] || null });
    }

    if (request.method === 'PATCH') {
      await requireAdmin(request);
      const body = request.body || {};
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const fields = ['title', 'category', 'difficulty', 'description', 'hint'];
      if (!id || fields.some((field) => typeof body[field] !== 'string' || !body[field].trim())) {
        return response.status(400).json({ error: 'Challenge ID and all challenge fields are required' });
      }

      const update = {
        name: body.title.trim(),
        category: body.category.trim(),
        difficulty: body.difficulty.trim(),
        description: body.description.trim(),
        hint: body.hint.trim()
      };
      const points = Number.isInteger(body.points) ? body.points : null;
      if (points !== null) validateDifficultyPoints(body.difficulty.trim(), points);
      if (typeof body.flag === 'string' && body.flag.trim()) {
        update.flag_hash = hashFlag(body.flag.trim());
      }
      if (Number.isInteger(body.points)) update.points = body.points;
      if (body.submission_limit === null) {
        update.submission_limit = null;
      } else if (Number.isInteger(body.submission_limit) && body.submission_limit >= 1) {
        update.submission_limit = body.submission_limit;
      }

      const { submission_limit, ...compatibleUpdate } = update;
      const updated = await supabaseRequest(`challenges?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(compatibleUpdate)
      });
      await setSubmissionLimit(
        id,
        normalizeSubmissionLimit(body.submission_limit)
      );
      if (Array.isArray(body.challenge_files) && body.challenge_files.length) {
        const uploadedFiles = await uploadChallengeFiles(id, body.challenge_files);
        const existingFiles = await getChallengeFiles(id);
        await setChallengeFiles(id, [...existingFiles, ...uploadedFiles]);
      }
      return response.status(200).json({ challenge: updated?.[0] || null });
    }

    if (request.method === 'DELETE') {
      await requireAdmin(request);
      const id = typeof request.body?.id === 'string' ? request.body.id.trim() : '';
      if (!id) return response.status(400).json({ error: 'Challenge ID is required' });
      await supabaseRequest(
        `site_settings?key=eq.${encodeURIComponent(submissionLimitKey(id))}`,
        { method: 'DELETE' }
      );
      await supabaseRequest(
        `site_settings?key=eq.${encodeURIComponent(challengeFilesKey(id))}`,
        { method: 'DELETE' }
      );
      await supabaseRequest(`submissions?challenge_id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      await supabaseRequest(`challenges?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return response.status(200).json({ success: true });
    }

    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return sendError(response, error);
  }
};
