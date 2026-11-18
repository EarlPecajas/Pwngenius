let supabaseClient;
let session;

const DIFFICULTY_POINTS = {
  Easy: [20, 30],
  Medium: [50, 70],
  Hard: [100],
  'Super Hard': [200]
};

function syncDifficultyPoints(form, difficulty, preferredPoints) {
  const pointsSelect = form.elements.points;
  if (!pointsSelect) return;
  const options = DIFFICULTY_POINTS[difficulty] || [];
  pointsSelect.innerHTML = options.map((points) =>
    `<option value="${points}">${points} POINTS</option>`
  ).join('');
  const preferred = Number(preferredPoints);
  pointsSelect.value = options.includes(preferred) ? String(preferred) : String(options[0] || '');
}

function loginStatus(message, type = 'error') {
  const element = document.querySelector('#admin-login-status');
  element.textContent = message;
  element.className = `form-status ${type}`;
}

async function loadLeaderboard() {
  const { leaderboard } = await adminRequest('/api/admin/leaderboard');
  const container = document.querySelector('#leaderboard-list');
  container.innerHTML = leaderboard.length
    ? `<div class="admin-table leaderboard-table"><div class="admin-table-head"><span>RANK</span><span>PLAYER</span><span>SOLVED</span><span>SCORE</span></div>${leaderboard.map((player, index) => `
      <div class="admin-table-row leaderboard-row">
        <span class="leaderboard-rank">${String(index + 1).padStart(2, '0')}</span>
        <div><strong>${escapeHtml(player.fullName || 'Unknown player')}</strong><small>@${escapeHtml(player.username || 'unknown')}</small></div>
        <span class="leaderboard-solved">${player.solvedCount} SOLVED</span>
        <strong class="leaderboard-score">${player.score} PTS</strong>
      </div>
    `).join('')}</div>`
    : '<p class="category-empty">NO SCORES YET</p>';
}

async function loadChallenges() {
  const { challenges } = await adminRequest('/api/challenges');
  const container = document.querySelector('#admin-challenge-list');
  container.innerHTML = challenges.length ? challenges.map((challenge) => `
    <button class="admin-challenge-card" type="button" data-challenge-id="${escapeHtml(challenge.id)}">
        <span class="challenge-meta">${escapeHtml(challenge.category)} / ${escapeHtml(challenge.difficulty)}</span>
        <strong>${escapeHtml(challenge.name)}</strong>
        <span class="challenge-score">${challenge.points} PTS</span>
        <span class="challenge-meta">${challenge.submission_limit ? `${challenge.submission_limit} SUBMISSIONS` : 'UNLIMITED SUBMISSIONS'}</span>
        <span class="admin-challenge-card-hint">CLICK TO EDIT</span>
    </button>
  `).join('') : '<p class="category-empty">NO CHALLENGES PUBLISHED</p>';
  document.querySelectorAll('.admin-challenge-card').forEach((card) => {
    card.addEventListener('click', () => openChallengeEditor(
      challenges.find((challenge) => challenge.id === card.dataset.challengeId)
    ));
  });
}

function openChallengeEditor(challenge) {
  const modal = document.querySelector('#admin-challenge-modal');
  const form = document.querySelector('#admin-edit-form');
  const category = form.elements.category;
  const difficulty = form.elements.difficulty;
  const knownCategory = Array.from(category.options).some((option) => option.value === challenge.category);
  if (!knownCategory) {
    category.add(new Option(challenge.category, challenge.category));
  }
  const knownDifficulty = Array.from(difficulty.options).some((option) => option.value === challenge.difficulty);
  if (!knownDifficulty) {
    difficulty.add(new Option(challenge.difficulty, challenge.difficulty));
  }
  form.dataset.challengeId = challenge.id;
  form.elements.title.value = challenge.name;
  form.elements.category.value = challenge.category;
  form.elements.difficulty.value = challenge.difficulty;
  form.elements.description.value = challenge.description;
  form.elements.hint.value = challenge.hint;
  form.elements.flag.value = '';
  syncDifficultyPoints(form, challenge.difficulty, challenge.points);
  form.elements.submission_limit.value = challenge.submission_limit || '';
  form.querySelector('.form-status').textContent = '';
  document.querySelector('#admin-edit-meta').textContent = `${challenge.category} / ${challenge.difficulty} · ${challenge.points} PTS`;
  document.querySelector('#admin-edit-title').textContent = challenge.name;
  modal.classList.remove('hidden');
}

function closeChallengeEditor() {
  document.querySelector('#admin-challenge-modal').classList.add('hidden');
}

async function loadEventState() {
  const result = await adminRequest('/api/admin/event');
  const toggle = document.querySelector('#event-toggle');
  document.querySelector('#event-state').textContent = result.locked
    ? 'LOCKED — PARTICIPANTS CANNOT VIEW CHALLENGES'
    : 'OPEN — PARTICIPANTS CAN VIEW CHALLENGES';
  toggle.textContent = result.locked ? 'UNLOCK CHALLENGES' : 'LOCK CHALLENGES';
  toggle.dataset.locked = String(result.locked);
}

function showAdminDashboard() {
  document.querySelector('#admin-login').classList.add('hidden');
  document.querySelector('#admin-auth-loading').classList.add('hidden');
  document.querySelector('#admin-dashboard').classList.remove('hidden');
}

async function requireAdminSession(currentSession) {
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', currentSession.user.id)
    .single();
  if (error || !profile || profile.role !== 'admin') {
    throw new Error('Administrator access required');
  }
}

async function loadAdminData() {
  const statusElement = document.querySelector('#admin-dashboard-status');
  statusElement.textContent = 'LOADING CONTROL ROOM DATA...';
  statusElement.className = 'form-status success';
  try {
    await Promise.all([loadUsers(), loadChallenges(), loadLeaderboard(), loadEventState()]);
    statusElement.textContent = '';
  } catch (error) {
    statusElement.textContent = error.message || 'Unable to load control room data.';
    statusElement.className = 'form-status error';
  }
}

async function updateChallenge(event, form) {
  event.preventDefault();
  const statusElement = form.querySelector('.form-status');
  const values = Object.fromEntries(new FormData(form).entries());
  values.id = form.dataset.challengeId;
  values.points = Number(values.points);
  values.submission_limit = values.submission_limit ? Number(values.submission_limit) : null;
  try {
    await adminRequest('/api/challenges', { method: 'PATCH', body: JSON.stringify(values) });
    statusElement.textContent = 'SAVED';
    statusElement.className = 'form-status success';
    await loadChallenges();
  } catch (error) {
    statusElement.textContent = error.message;
    statusElement.className = 'form-status error';
  }
}

async function deleteChallenge(form) {
  if (!window.confirm('Delete this challenge and its submissions permanently?')) return;
  try {
    await adminRequest('/api/challenges', {
      method: 'DELETE',
      body: JSON.stringify({ id: form.dataset.challengeId })
    });
    closeChallengeEditor();
    await loadChallenges();
  } catch (error) {
    window.alert(error.message);
  }
}

document.querySelector('#admin-edit-form').addEventListener('submit', (event) => {
  updateChallenge(event, event.currentTarget);
});
document.querySelector('#admin-edit-form .delete-challenge').addEventListener('click', () => {
  deleteChallenge(document.querySelector('#admin-edit-form'));
});
document.querySelector('#admin-edit-close').addEventListener('click', closeChallengeEditor);
document.querySelector('#admin-edit-cancel').addEventListener('click', closeChallengeEditor);
document.querySelector('#admin-challenge-modal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeChallengeEditor();
});

function status(message, type = 'error') {
  const element = document.querySelector('#challenge-status');
  element.textContent = message;
  element.className = `form-status ${type}`;
}

async function adminRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

async function loadUsers() {
  const { users } = await adminRequest('/api/admin/users');
  document.querySelector('#user-list').innerHTML = users.length
    ? `<div class="admin-table users-table"><div class="admin-table-head"><span>PLAYER</span><span>ACCOUNT</span><span>ACTIONS</span></div>${users.map((user) => `
    <div class="admin-table-row user-row">
      <div><strong>${escapeHtml(user.full_name || 'Unknown player')}</strong><small>@${escapeHtml(user.username || 'unknown')}</small></div>
      <small>${escapeHtml(user.email || 'No email')}</small>
      <div class="user-actions">
        <button class="text-button reset-user" data-user-id="${escapeHtml(user.id)}" type="button">RESET PASSWORD</button>
        <button class="text-button delete-user" data-user-id="${escapeHtml(user.id)}" type="button">DELETE</button>
      </div>
    </div>
  `).join('')}</div>`
    : '<p class="category-empty">NO REGISTERED PLAYERS</p>';
  document.querySelectorAll('.reset-user').forEach((button) => {
    button.addEventListener('click', () => resetPassword(button.dataset.userId));
  });
  document.querySelectorAll('.delete-user').forEach((button) => {
    button.addEventListener('click', () => deleteUser(button.dataset.userId));
  });
}

async function resetPassword(userId) {
  const password = window.prompt('Enter a temporary password (at least 8 characters):');
  if (password === null) return;
  try {
    await adminRequest('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({ userId, password })
    });
    window.alert('Password updated.');
  } catch (error) {
    window.alert(error.message);
  }
}

async function deleteUser(userId) {
  if (!window.confirm('Delete this account permanently?')) return;
  try {
    await adminRequest('/api/admin/users', {
      method: 'DELETE',
      body: JSON.stringify({ userId })
    });
    await loadUsers();
  } catch (error) {
    window.alert(error.message);
  }
}

document.querySelector('#challenge-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  values.points = Number(values.points);
  values.submission_limit = values.submission_limit ? Number(values.submission_limit) : null;
  try {
    await adminRequest('/api/challenges', { method: 'POST', body: JSON.stringify(values) });
    form.reset();
    syncDifficultyPoints(form, 'Easy', 20);
    form.elements.difficulty.value = '';
    form.elements.submission_limit.value = '';
    status('CHALLENGE PUBLISHED', 'success');
    await loadChallenges();
  } catch (error) {
    status(error.message);
  }
});

document.querySelector('#challenge-form').elements.difficulty.addEventListener('change', (event) => {
  syncDifficultyPoints(event.currentTarget.form, event.target.value);
});

document.querySelector('#admin-edit-form').elements.difficulty.addEventListener('change', (event) => {
  syncDifficultyPoints(event.currentTarget.form, event.target.value);
});

document.querySelector('#event-toggle').addEventListener('click', async (event) => {
  const locked = event.currentTarget.dataset.locked !== 'true';
  const toggle = event.currentTarget;
  const eventStatus = document.querySelector('#event-status');
  toggle.disabled = true;
  toggle.textContent = locked ? 'LOCKING...' : 'UNLOCKING...';
  eventStatus.textContent = locked ? 'LOCKING CHALLENGES...' : 'UNLOCKING CHALLENGES...';
  eventStatus.className = 'form-status success';
  try {
    await adminRequest('/api/admin/event', {
      method: 'PATCH',
      body: JSON.stringify({ locked })
    });
    await loadEventState();
    eventStatus.textContent = locked ? 'CHALLENGES LOCKED' : 'CHALLENGES UNLOCKED';
  } catch (error) {
    eventStatus.textContent = error.message;
    eventStatus.className = 'form-status error';
    await loadEventState();
  } finally {
    toggle.disabled = false;
  }
});

document.querySelectorAll('.admin-nav-button').forEach((button) => {
  button.addEventListener('click', async () => {
    const view = button.dataset.adminView;
    document.querySelectorAll('.admin-nav-button').forEach((item) => {
      item.classList.toggle('active', item === button);
    });
    document.querySelectorAll('.admin-view').forEach((item) => item.classList.add('hidden'));
    document.querySelector(`#${view}-view`).classList.remove('hidden');
    if (view === 'leaderboard') {
      try {
        await loadLeaderboard();
      } catch (error) {
        document.querySelector('#leaderboard-list').textContent = error.message;
      }
    }
  });
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = '/';
});

document.querySelector('#admin-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  loginStatus('AUTHENTICATING...', 'success');
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: document.querySelector('#admin-identifier').value,
        password: document.querySelector('#admin-password').value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const { data: signedIn, error: sessionError } = await supabaseClient.auth.setSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token
    });
    if (sessionError) throw sessionError;
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', signedIn.session.user.id)
      .single();
    if (profileError || !profile || profile.role !== 'admin') {
      await supabaseClient.auth.signOut();
      throw new Error('Administrator access required');
    }
    session = signedIn.session;
    showAdminDashboard();
    await loadAdminData();
  } catch (error) {
    loginStatus(error.message || 'LOGIN FAILED');
  }
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[character]));
}

(async () => {
  try {
    const config = await fetch('/api/config').then((response) => response.json());
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const result = await supabaseClient.auth.getSession();
    session = result.data.session;
    if (session) {
      try {
        await requireAdminSession(session);
        showAdminDashboard();
        await loadAdminData();
      } catch (error) {
        await supabaseClient.auth.signOut();
        session = null;
        document.querySelector('#admin-auth-loading').classList.add('hidden');
        document.querySelector('#admin-login').classList.remove('hidden');
        loginStatus(error.message);
      }
    } else {
      document.querySelector('#admin-auth-loading').classList.add('hidden');
      document.querySelector('#admin-login').classList.remove('hidden');
    }
  } catch (error) {
    document.querySelector('#admin-auth-loading').classList.add('hidden');
    document.querySelector('#admin-login').classList.remove('hidden');
    loginStatus(error.message);
  }
})();
