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
  'Super Hard': [200],
  Insane: [500]
};

function validateDifficultyPoints(difficulty, points) {
  if (!DIFFICULTY_POINTS[difficulty]) {
    throw new Error('Invalid difficulty');
  }
  if (!DIFFICULTY_POINTS[difficulty].includes(points)) {
    throw new Error(`Invalid points for ${difficulty}`);
  }
}

const UNLOCK_GATE_SETTING = 'challenge_unlock_gate_id';

async function getUnlockGateId() {
  const settings = await supabaseRequest(
    `site_settings?key=eq.${UNLOCK_GATE_SETTING}&select=value&limit=1`
  );
  return settings[0]?.value || null;
}

async function setUnlockGateId(challengeId) {
  if (!challengeId) {
    await supabaseRequest(
      `site_settings?key=eq.${UNLOCK_GATE_SETTING}`,
      { method: 'DELETE' }
    );
    return;
  }
  await supabaseRequest('site_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: UNLOCK_GATE_SETTING, value: challengeId })
  });
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
      const roleProfiles = await supabaseRequest(
        `profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`
      );
      const isAdmin = roleProfiles[0]?.role === 'admin';
      const scheduleSettings = await supabaseRequest(
        'site_settings?key=in.(challenges_locked,event_start,event_end)&select=key,value'
      );
      const scheduleValues = Object.fromEntries(scheduleSettings.map((setting) => [setting.key, setting.value]));
      const now = Date.now();
      const startTime = scheduleValues.event_start ? new Date(scheduleValues.event_start).getTime() : null;
      const endTime = scheduleValues.event_end ? new Date(scheduleValues.event_end).getTime() : null;
      const hasValidSchedule = Number.isFinite(startTime) && Number.isFinite(endTime);
      const scheduledLocked = hasValidSchedule && (now < startTime || now >= endTime);
      const manuallyLocked = scheduleValues.challenges_locked !== 'false';
      const effectiveLocked = hasValidSchedule ? (manuallyLocked || scheduledLocked) : manuallyLocked;
      if (!isAdmin && effectiveLocked) {
        return response.status(200).json({
          locked: true,
          challenges: [],
          schedule: hasValidSchedule ? {
            start: scheduleValues.event_start,
            end: scheduleValues.event_end
          } : null
        });
      }
      const unlockGateId = await getUnlockGateId();
      const challenges = await supabaseRequest(
        'challenges?select=id,name,category,difficulty,description,hint,author,points,locked,created_at&order=created_at.desc'
      );
      const [submissions, allCorrectSubmissions, limitSettings, fileSettings, profiles] = await Promise.all([
        supabaseRequest(`submissions?user_id=eq.${encodeURIComponent(user.id)}&select=challenge_id,correct`),
        supabaseRequest('submissions?correct=eq.true&select=user_id,challenge_id,created_at'),
        supabaseRequest('site_settings?key=like.challenge_submission_limit:*&select=key,value'),
        supabaseRequest('site_settings?key=like.challenge_files:*&select=key,value'),
        supabaseRequest('profiles?select=id,full_name,username')
      ]);
      const solvedIds = new Set(
        submissions.filter((submission) => submission.correct).map((submission) => submission.challenge_id)
      );
      const solversByChallenge = new Map();
      const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
      allCorrectSubmissions.forEach((submission) => {
        if (!submission.user_id) return;
        if (!solversByChallenge.has(submission.challenge_id)) {
          solversByChallenge.set(submission.challenge_id, new Map());
        }
        const challengeSolvers = solversByChallenge.get(submission.challenge_id);
        const current = challengeSolvers.get(submission.user_id);
        if (!current || (submission.created_at && new Date(submission.created_at) < new Date(current))) {
          challengeSolvers.set(submission.user_id, submission.created_at || null);
        }
      });
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
      const gateSolved = unlockGateId && solvedIds.has(unlockGateId);
      const validUnlockGateId = unlockGateId && challenges.some((challenge) => challenge.id === unlockGateId)
        ? unlockGateId
        : null;
      const gateSolvedForVisibility = validUnlockGateId && gateSolved;
      const visibleChallenges = isAdmin
        ? challenges
        : gateSolvedForVisibility
          ? challenges.filter((challenge) =>
              challenge.locked !== true && challenge.id !== validUnlockGateId
            )
        : !validUnlockGateId
          ? challenges.filter((challenge) => challenge.locked !== true)
          : challenges.filter((challenge) => challenge.id === validUnlockGateId);
      return response.status(200).json({
        locked: !isAdmin && effectiveLocked,
        schedule: hasValidSchedule ? {
          start: scheduleValues.event_start,
          end: scheduleValues.event_end
        } : null,
        unlockGateId: validUnlockGateId,
        unlockGateSolved: isAdmin ? false : Boolean(gateSolvedForVisibility),
        challenges: visibleChallenges.map((challenge) => ({
          ...challenge,
          unlockGate: challenge.id === validUnlockGateId,
          solved: solvedIds.has(challenge.id),
          solveCount: solversByChallenge.get(challenge.id)?.size || 0,
          solvers: [...(solversByChallenge.get(challenge.id) || new Map()).entries()].map(([userId, solvedAt]) => {
            const profile = profileById.get(userId);
            return {
              username: profile?.username || 'Unknown user',
              solvedAt
            };
          }).sort((left, right) =>
            (left.solvedAt ? new Date(left.solvedAt).getTime() : Number.POSITIVE_INFINITY)
              - (right.solvedAt ? new Date(right.solvedAt).getTime() : Number.POSITIVE_INFINITY)
            || left.username.localeCompare(right.username)
          ),
          submissionLimit: limitsByChallenge.get(challenge.id) || null,
          submissionCount: attemptCounts.get(challenge.id) || 0,
          files: filesByChallenge.get(challenge.id) || []
        }))
      });
    }

    if (request.method === 'POST') {
      await requireAdmin(request);
      const body = request.body || {};
      const unlockGate = body.unlock_gate === true;
      const required = unlockGate
        ? ['title', 'description', 'hint', 'flag', 'author']
        : ['title', 'category', 'difficulty', 'description', 'hint', 'flag', 'author'];
      if (required.some((field) => typeof body[field] !== 'string' || !body[field].trim())) {
        return response.status(400).json({ error: 'All challenge fields are required' });
      }
      const id = body.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const points = unlockGate ? 0 : (Number.isInteger(body.points) ? body.points : 100);
      if (!unlockGate) validateDifficultyPoints(body.difficulty.trim(), points);
      const challengeData = {
          id,
          name: body.title.trim(),
          category: unlockGate ? 'Unknown' : body.category.trim(),
          difficulty: unlockGate ? 'Unknown' : body.difficulty.trim(),
          description: body.description.trim(),
          hint: body.hint.trim(),
          author: body.author.trim(),
          flag_hash: hashFlag(body.flag.trim()),
          points,
          locked: body.locked === true,
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
      if (unlockGate) await setUnlockGateId(id);
      const uploadedFiles = await uploadChallengeFiles(id, body.challenge_files);
      await setChallengeFiles(id, uploadedFiles);
      return response.status(201).json({ challenge: created?.[0] || null });
    }

    if (request.method === 'PATCH') {
      await requireAdmin(request);
      const body = request.body || {};
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const fields = ['title', 'category', 'difficulty', 'description', 'hint', 'author'];
      if (!id || fields.some((field) => typeof body[field] !== 'string' || !body[field].trim())) {
        return response.status(400).json({ error: 'Challenge ID and all challenge fields are required' });
      }

      const update = {
        name: body.title.trim(),
        category: body.unlock_gate === true ? 'Unknown' : body.category.trim(),
        difficulty: body.unlock_gate === true ? 'Unknown' : body.difficulty.trim(),
        description: body.description.trim(),
        hint: body.hint.trim(),
        author: body.author.trim()
      };
      const points = body.unlock_gate === true ? 0 : (Number.isInteger(body.points) ? body.points : null);
      if (body.unlock_gate !== true && points !== null) validateDifficultyPoints(body.difficulty.trim(), points);
      if (typeof body.flag === 'string' && body.flag.trim()) {
        update.flag_hash = hashFlag(body.flag.trim());
      }
      if (Number.isInteger(body.points)) update.points = body.points;
      if (typeof body.locked === 'boolean') update.locked = body.locked;
      if (body.unlock_gate === true) update.points = 0;
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
      if (body.unlock_gate === true) {
        await setUnlockGateId(id);
      } else {
        const currentGateId = await getUnlockGateId();
        if (currentGateId === id) await setUnlockGateId(null);
      }
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
      const currentGateId = await getUnlockGateId();
      if (currentGateId === id) await setUnlockGateId(null);
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
