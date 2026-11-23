const { requireAdmin, sendError, supabaseRequest } = require('../_supabase');

module.exports = async function handler(request, response) {
  try {
    await requireAdmin(request);
    const action = request.query?.action || '';

    if (action === 'settings' && request.method === 'GET') {
      const settings = await supabaseRequest(
        'site_settings?key=in.(leaderboard_hidden,leaderboard_published,leaderboard_publish_title)&select=key,value'
      );
      const values = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
      return response.status(200).json({
        hidden: values.leaderboard_hidden === 'true',
        published: values.leaderboard_published === 'true',
        title: values.leaderboard_publish_title || ''
      });
    }

    if (action === 'settings' && request.method === 'PATCH') {
      const hidden = request.body?.hidden === true;
      await supabaseRequest('site_settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: 'leaderboard_hidden', value: String(hidden) })
      });
      const verified = await supabaseRequest(
        'site_settings?key=eq.leaderboard_hidden&select=value&limit=1'
      );
      return response.status(200).json({ hidden: verified[0]?.value === 'true' });
    }

    if (action === 'publication' && request.method === 'PATCH') {
      const published = request.body?.published === true;
      const title = typeof request.body?.title === 'string' ? request.body.title.trim() : '';
      if (published && !title) {
        return response.status(400).json({ error: 'A leaderboard title is required before publishing' });
      }
      await supabaseRequest('site_settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([
          { key: 'leaderboard_published', value: String(published) },
          { key: 'leaderboard_publish_title', value: title }
        ])
      });
      return response.status(200).json({ published, title });
    }

    if (action === 'save-copy' && request.method === 'POST') {
      const title = typeof request.body?.title === 'string' ? request.body.title.trim() : '';
      const [profiles, submissions, challenges] = await Promise.all([
        supabaseRequest('profiles?select=id,username'),
        supabaseRequest('submissions?correct=eq.true&select=user_id,challenge_id,created_at'),
        supabaseRequest('challenges?select=id,points')
      ]);
      const points = new Map(challenges.map((challenge) => [challenge.id, challenge.points]));
      const solved = new Map();
      const firstSolveByChallenge = new Map();
      submissions.forEach((submission) => {
        if (!submission.user_id) return;
        if (!solved.has(submission.user_id)) solved.set(submission.user_id, new Set());
        solved.get(submission.user_id).add(submission.challenge_id);
        if (submission.created_at) {
          const key = `${submission.user_id}:${submission.challenge_id}`;
          const current = firstSolveByChallenge.get(key);
          if (!current || new Date(submission.created_at) < new Date(current)) {
            firstSolveByChallenge.set(key, submission.created_at);
          }
        }
      });
      const snapshot = profiles.map((profile) => {
        const solvedIds = solved.get(profile.id) || new Set();
        const completionTimes = [...solvedIds]
          .map((challengeId) => firstSolveByChallenge.get(`${profile.id}:${challengeId}`))
          .filter(Boolean)
          .map((timestamp) => new Date(timestamp).getTime());
        const completionAt = completionTimes.length ? Math.max(...completionTimes) : null;
        return {
          username: profile.username || 'Unknown player',
          score: [...solvedIds].reduce((total, challengeId) => total + (points.get(challengeId) || 0), 0),
          solvedCount: solvedIds.size,
          completionAt: completionAt ? new Date(completionAt).toISOString() : null
        };
      }).sort((left, right) => right.score - left.score
        || (left.completionAt ? new Date(left.completionAt).getTime() : Number.POSITIVE_INFINITY)
          - (right.completionAt ? new Date(right.completionAt).getTime() : Number.POSITIVE_INFINITY)
        || left.username.localeCompare(right.username))
        .map((player, index) => ({ ...player, position: index + 1 }));
      await supabaseRequest('site_settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          key: 'leaderboard_snapshot',
          value: JSON.stringify({ title, createdAt: new Date().toISOString(), leaderboard: snapshot })
        })
      });
      return response.status(200).json({ success: true, title, leaderboard: snapshot });
    }

    if (action === 'reset' && request.method === 'DELETE') {
      await supabaseRequest('submissions?correct=eq.true', { method: 'DELETE' });
      return response.status(200).json({ success: true });
    }

    if (action === 'logs' && request.method === 'GET') {
      const [submissions, challenges, profiles] = await Promise.all([
        supabaseRequest('submissions?correct=eq.true&select=user_id,challenge_id,created_at&order=created_at.desc'),
        supabaseRequest('challenges?select=id,name'),
        supabaseRequest('profiles?select=id,full_name,username')
      ]);
      const challengeMap = new Map(challenges.map((challenge) => [challenge.id, challenge]));
      const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
      const logs = submissions.map((submission) => {
        const challenge = challengeMap.get(submission.challenge_id);
        const profile = profileMap.get(submission.user_id);
        return {
          userName: profile?.full_name || profile?.username || 'Unknown user',
          challengeName: challenge?.name || 'Deleted challenge',
          submittedAt: submission.created_at || null
        };
      });
      return response.status(200).json({ data: logs });
    }

    if (action === 'solves' && request.method === 'GET') {
      const [submissions, challenges, profiles] = await Promise.all([
        supabaseRequest('submissions?correct=eq.true&select=user_id,challenge_id,created_at'),
        supabaseRequest('challenges?select=id,name,category,difficulty,points'),
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
      supabaseRequest('submissions?correct=eq.true&select=user_id,challenge_id,created_at'),
      supabaseRequest('challenges?select=id,name,category,points')
    ]);
    const points = new Map(challenges.map((challenge) => [challenge.id, challenge.points]));
    const scores = new Map();
    const firstSolveByChallenge = new Map();
    submissions.forEach((submission) => {
      if (!submission.user_id) return;
      if (!scores.has(submission.user_id)) scores.set(submission.user_id, new Set());
      scores.get(submission.user_id).add(submission.challenge_id);
      if (submission.created_at) {
        const key = `${submission.user_id}:${submission.challenge_id}`;
        const current = firstSolveByChallenge.get(key);
        if (!current || new Date(submission.created_at) < new Date(current)) {
          firstSolveByChallenge.set(key, submission.created_at);
        }
      }
    });

    const leaderboard = profiles.map((profile) => {
      const solved = scores.get(profile.id) || new Set();
      const score = [...solved].reduce((total, challengeId) => (
        total + (points.get(challengeId) || 0)
      ), 0);
      const solvedChallenges = [...solved]
        .map((challengeId) => challenges.find((challenge) => challenge.id === challengeId))
        .filter(Boolean)
        .sort((left, right) => left.name.localeCompare(right.name));
      const completionTimes = [...solved]
        .map((challengeId) => firstSolveByChallenge.get(`${profile.id}:${challengeId}`))
        .filter(Boolean)
        .map((timestamp) => new Date(timestamp).getTime());
      const completionAt = completionTimes.length ? Math.max(...completionTimes) : null;
      return {
        id: profile.id,
        fullName: profile.full_name,
        username: profile.username,
        solvedCount: solved.size,
        score,
        completionAt: completionAt ? new Date(completionAt).toISOString() : null,
        solvedChallenges
      };
    }).sort((left, right) => right.score - left.score
      || (left.completionAt ? new Date(left.completionAt).getTime() : Number.POSITIVE_INFINITY)
        - (right.completionAt ? new Date(right.completionAt).getTime() : Number.POSITIVE_INFINITY)
      || left.username.localeCompare(right.username));

    return response.status(200).json({ leaderboard });
  } catch (error) {
    return sendError(response, error);
  }
};
