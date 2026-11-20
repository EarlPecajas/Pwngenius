let supabaseClient;
let session;

const DIFFICULTY_POINTS = {
  Easy: [20, 30],
  Medium: [50, 70],
  Hard: [100],
  'Super Hard': [200],
  Insane: [500]
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

function normalizeHintValues(hints) {
  return hints.map((hint) => String(hint).trim()).filter(Boolean);
}

function addHintRow(container, value = '') {
  const row = document.createElement('div');
  row.className = 'hint-row';
  const input = document.createElement('input');
  input.name = 'hint';
  input.placeholder = `Enter hint ${container.querySelectorAll('.hint-row').length + 1}`;
  input.value = value;
  input.required = container.querySelectorAll('.hint-row').length === 0;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'hint-remove-button';
  remove.textContent = '×';
  remove.setAttribute('aria-label', 'Remove hint');
  remove.addEventListener('click', () => {
    row.remove();
    const rows = [...container.querySelectorAll('.hint-row')];
    rows.forEach((item, index) => {
      item.querySelector('input').placeholder = `Enter hint ${index + 1}`;
      item.querySelector('input').required = index === 0;
    });
  });
  row.append(input, remove);
  container.append(row);
}

function parseHints(value) {
  if (Array.isArray(value)) return normalizeHintValues(value);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return normalizeHintValues(parsed);
  } catch {}
  const hint = value.trim();
  return hint ? [hint] : [];
}

document.querySelector('#add-publish-hint').addEventListener('click', () => {
  addHintRow(document.querySelector('#publish-hint-list'));
});

document.querySelector('#add-edit-hint').addEventListener('click', () => {
  addHintRow(document.querySelector('#edit-hint-list'));
});

addHintRow(document.querySelector('#publish-hint-list'));

async function readChallengeFiles(form) {
  const input = form.elements.challenge_files;
  if (!input || !input.files.length) return [];
  return Promise.all(Array.from(input.files).map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type || 'application/octet-stream',
      data: reader.result
    });
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  })));
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
        <button class="admin-action-button leaderboard-solves-toggle" type="button" data-player-id="${escapeHtml(player.id)}">${player.solvedCount} SOLVED</button>
        <strong class="leaderboard-score">${player.score} PTS</strong>
      </div>
      <div id="leaderboard-solves-${escapeHtml(player.id)}" class="leaderboard-solves-detail hidden">
        ${player.solvedChallenges.length
          ? player.solvedChallenges.map((challenge) => `<div><span>${escapeHtml(challenge.name)}</span><small>${escapeHtml(challenge.category)} · ${challenge.points} PTS</small></div>`).join('')
          : '<p>NO CHALLENGES SOLVED</p>'}
      </div>
    `).join('')}</div>`
    : '<p class="category-empty">NO SCORES YET</p>';
  container.querySelectorAll('.leaderboard-solves-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      button.parentElement.nextElementSibling.classList.toggle('hidden');
    });
  });
}

async function loadLeaderboardVisibility() {
  const result = await adminRequest('/api/admin/leaderboard?action=settings&nocache=' + Date.now());
  const toggle = document.querySelector('#leaderboard-visibility-toggle');
  const indicator = document.querySelector('#leaderboard-visibility-indicator');
  toggle.textContent = result.hidden ? 'SHOW LEADERBOARD' : 'HIDE LEADERBOARD';
  toggle.dataset.hidden = String(result.hidden);
  indicator.textContent = result.hidden ? '● HIDDEN FROM USERS' : '● VISIBLE TO USERS';
  indicator.className = `leaderboard-visibility-indicator ${result.hidden ? 'hidden-state' : 'visible-state'}`;
}

async function loadSolvesChart() {
  const category = document.querySelector('#solves-category').value;
  const difficulty = document.querySelector('#solves-difficulty').value;
  const query = new URLSearchParams();
  if (category) query.set('category', category);
  if (difficulty) query.set('difficulty', difficulty);
  const queryParams = query.size ? `&${query}` : '';
  const { data } = await adminRequest(`/api/admin/leaderboard?action=solves${queryParams}`);
  renderSolvesChart(data);
}

async function loadSubmissionLogs() {
  const list = document.querySelector('#submission-logs-list');
  const count = document.querySelector('#submission-logs-count');
  try {
    const { data } = await adminRequest('/api/admin/leaderboard?action=logs&nocache=' + Date.now());
    count.textContent = `${data.length} ${data.length === 1 ? 'ENTRY' : 'ENTRIES'}`;
    if (!data.length) {
      list.innerHTML = '<p class="submission-logs-empty">NO CORRECT SUBMISSIONS HAVE BEEN RECORDED</p>';
      return;
    }
    list.innerHTML = data.map((log) => {
      const submittedAt = log.submittedAt
        ? new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }).format(new Date(log.submittedAt))
        : 'Unknown time';
      return `<div class="submission-log-row">
        <strong>${escapeHtml(log.userName)}</strong>
        <span>${escapeHtml(log.challengeName)}</span>
        <time>${escapeHtml(submittedAt)}</time>
      </div>`;
    }).join('');
  } catch (error) {
    count.textContent = '0 ENTRIES';
    list.innerHTML = `<p class="submission-logs-empty error">${escapeHtml(error.message)}</p>`;
  }
}

function renderSolvesChart(data) {
  const chart = document.querySelector('#solves-pie-chart');
  const legend = document.querySelector('#solves-chart-legend');
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (!total) {
    chart.style.background = 'conic-gradient(rgba(120, 134, 157, .12) 0 100%)';
    chart.dataset.label = '0 SOLVES';
    legend.innerHTML = '<p class="category-empty">NO SOLVES MATCH THIS FILTER</p>';
    return;
  }
  const colors = ['#3d8bff', '#70c8ff', '#d7ed4b', '#ff765e', '#a78bfa', '#8cff66', '#f472b6', '#fb923c'];
  let offset = 0;
  const segments = [];
  const legendItems = [];
  data.forEach((item, index) => {
    const percentage = item.count / total * 100;
    const end = offset + percentage;
    const color = colors[index % colors.length];
    segments.push(`${color} ${offset}% ${end}%`);
    legendItems.push(`<li><span class="category-dot" style="background:${color}"></span><span>${escapeHtml(item.label)}</span><strong>${item.count} · ${Math.round(percentage)}%</strong></li>`);
    offset = end;
  });
  chart.style.background = `conic-gradient(${segments.join(', ')})`;
  chart.dataset.label = `${total} SOLVE${total === 1 ? '' : 'S'}`;
  legend.innerHTML = `<ul>${legendItems.join('')}</ul>`;
}

async function loadChallenges() {
  const { challenges } = await adminRequest('/api/challenges');
  const container = document.querySelector('#admin-challenge-list');
  if (!challenges.length) {
    container.innerHTML = '<p class="category-empty">NO CHALLENGES PUBLISHED</p>';
    return;
  }
  const categories = new Map();
  challenges.forEach((challenge) => {
    const category = challenge.category || 'General';
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category).push(challenge);
  });
  container.innerHTML = [...categories.entries()].map(([category, grouped]) => `
    <section class="challenge-category-section admin-category-section">
      <div class="challenge-category-heading"><h2>${escapeHtml(category)}</h2></div>
      <div class="challenge-category-grid">
        ${grouped.map((challenge) => `
          <article class="admin-challenge-card" data-challenge-id="${escapeHtml(challenge.id)}">
            <button class="admin-challenge-edit" type="button" data-challenge-id="${escapeHtml(challenge.id)}">
              <span class="challenge-meta">${escapeHtml(challenge.category)} / ${escapeHtml(challenge.difficulty)}</span>
              <strong>${escapeHtml(challenge.name)}</strong>
              <span class="challenge-meta">${escapeHtml(challenge.author || 'Anonymous')}</span>
              <span class="challenge-score">${challenge.points} PTS</span>
              <span class="challenge-meta">${challenge.submissionLimit ? `${challenge.submissionLimit} SUBMISSIONS` : 'UNLIMITED SUBMISSIONS'}</span>
              ${challenge.files?.length ? `<span class="challenge-meta">${challenge.files.length} FILE${challenge.files.length === 1 ? '' : 'S'}</span>` : ''}
              <span class="admin-challenge-card-hint">CLICK TO EDIT</span>
            </button>
            <button class="admin-action-button admin-challenge-lock" type="button" data-challenge-id="${escapeHtml(challenge.id)}">${challenge.locked ? 'UNLOCK CHALLENGE' : 'LOCK CHALLENGE'}</button>
          </article>
        `).join('')}
      </div>
    </section>
  `).join('');
  container.querySelectorAll('.admin-challenge-edit').forEach((button) => {
    button.addEventListener('click', () => openChallengeEditor(
      challenges.find((challenge) => challenge.id === button.dataset.challengeId)
    ));
  });
  container.querySelectorAll('.admin-challenge-lock').forEach((button) => {
    button.addEventListener('click', async () => {
      const challenge = challenges.find((item) => item.id === button.dataset.challengeId);
      if (!challenge) return;
      button.disabled = true;
      try {
        await adminRequest('/api/challenges', {
          method: 'PATCH',
          body: JSON.stringify({ id: challenge.id, title: challenge.name, category: challenge.category, difficulty: challenge.difficulty, description: challenge.description, hint: challenge.hint, author: challenge.author, points: challenge.points, submission_limit: challenge.submissionLimit, locked: !challenge.locked })
        });
        await loadChallenges();
      } catch (error) {
        window.alert(error.message);
        button.disabled = false;
      }
    });
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
  form.elements.author.value = challenge.author || 'Anonymous';
  form.elements.description.value = challenge.description;
  const editHintList = form.querySelector('#edit-hint-list');
  editHintList.innerHTML = '';
  const hints = parseHints(challenge.hint);
  if (hints.length) hints.forEach((hint) => addHintRow(editHintList, hint));
  else addHintRow(editHintList);
  form.elements.flag.value = '';
  syncDifficultyPoints(form, challenge.difficulty, challenge.points);
  form.elements.submission_limit.value = challenge.submissionLimit || '';
  form.elements.locked.checked = challenge.locked === true;
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
  values.hint = JSON.stringify(normalizeHintValues(
    [...form.querySelectorAll('#edit-hint-list input[name="hint"]')].map((input) => input.value)
  ));
  values.id = form.dataset.challengeId;
  values.points = Number(values.points);
  values.submission_limit = values.submission_limit ? Number(values.submission_limit) : null;
  values.locked = form.elements.locked.checked;
  try {
    values.challenge_files = await readChallengeFiles(form);
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
  values.hint = JSON.stringify(normalizeHintValues(
    [...form.querySelectorAll('#publish-hint-list input[name="hint"]')].map((input) => input.value)
  ));
  values.points = Number(values.points);
  values.submission_limit = values.submission_limit ? Number(values.submission_limit) : null;
  values.locked = form.elements.locked.checked;
  try {
    values.challenge_files = await readChallengeFiles(form);
    await adminRequest('/api/challenges', { method: 'POST', body: JSON.stringify(values) });
    form.reset();
    const publishHintList = form.querySelector('#publish-hint-list');
    publishHintList.innerHTML = '';
    addHintRow(publishHintList);
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
        await loadLeaderboardVisibility();
      } catch (error) {
        document.querySelector('#leaderboard-list').textContent = error.message;
      }
    }
    if (view === 'solves') {
      try {
        await loadSolvesChart();
        await loadSubmissionLogs();
      } catch (error) {
        document.querySelector('#solves-chart-legend').innerHTML =
          `<p class="form-status error">${escapeHtml(error.message)}</p>`;
      }
    }
  });
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = '/';
});

document.querySelector('#leaderboard-visibility-toggle').addEventListener('click', async (event) => {
  const status = document.querySelector('#leaderboard-control-status');
  const toggle = event.currentTarget;
  const indicator = document.querySelector('#leaderboard-visibility-indicator');
  const hidden = event.currentTarget.dataset.hidden !== 'true';
  toggle.disabled = true;
  toggle.textContent = hidden ? 'HIDING...' : 'SHOWING...';
  indicator.textContent = hidden ? '● UPDATING...' : '● UPDATING...';
  indicator.className = 'leaderboard-visibility-indicator';
  try {
    const result = await adminRequest('/api/admin/leaderboard?action=settings&nocache=' + Date.now(), {
      method: 'PATCH',
      body: JSON.stringify({ hidden })
    });
    await loadLeaderboardVisibility();
    status.textContent = result.hidden ? 'LEADERBOARD HIDDEN FROM USERS' : 'LEADERBOARD VISIBLE TO USERS';
    status.className = 'form-status success';
  } catch (error) {
    status.textContent = error.message;
    status.className = 'form-status error';
  } finally {
    event.currentTarget.disabled = false;
  }
});

document.querySelector('#reset-scores-button').addEventListener('click', async () => {
  if (!window.confirm('Reset all correct solve scores? This cannot be undone.')) return;
  const status = document.querySelector('#leaderboard-control-status');
  try {
    await adminRequest('/api/admin/leaderboard?action=reset', { method: 'DELETE' });
    status.textContent = 'ALL SCORES RESET';
    status.className = 'form-status success';
    await loadLeaderboard();
    if (!document.querySelector('#solves-view').classList.contains('hidden')) {
      await Promise.all([loadSolvesChart(), loadSubmissionLogs()]);
    }
  } catch (error) {
    status.textContent = error.message;
    status.className = 'form-status error';
  }
});

document.querySelector('#solves-category').addEventListener('change', () => loadSolvesChart());
document.querySelector('#solves-difficulty').addEventListener('change', () => loadSolvesChart());

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
