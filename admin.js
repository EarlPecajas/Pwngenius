let supabaseClient;
let session;

function loginStatus(message, type = 'error') {
  const element = document.querySelector('#admin-login-status');
  element.textContent = message;
  element.className = `form-status ${type}`;
}

async function loadLeaderboard() {
  const { leaderboard } = await adminRequest('/api/admin/leaderboard');
  document.querySelector('#leaderboard-list').innerHTML = leaderboard.map((player, index) => `
    <article class="leaderboard-row">
      <span class="leaderboard-rank">${String(index + 1).padStart(2, '0')}</span>
      <div><strong>${escapeHtml(player.fullName)}</strong><small>@${escapeHtml(player.username)}</small></div>
      <span class="leaderboard-solved">${player.solvedCount} SOLVED</span>
      <strong class="leaderboard-score">${player.score} PTS</strong>
    </article>
  `).join('');
}

async function loadChallenges() {
  const { challenges } = await adminRequest('/api/challenges');
  document.querySelector('#admin-challenge-list').innerHTML = challenges.map((challenge) => `
    <form class="admin-challenge-row" data-challenge-id="${escapeHtml(challenge.id)}">
      <input name="title" value="${escapeHtml(challenge.name)}" required />
      <input name="category" value="${escapeHtml(challenge.category)}" required />
      <input name="difficulty" value="${escapeHtml(challenge.difficulty)}" required />
      <textarea name="description" required>${escapeHtml(challenge.description)}</textarea>
      <textarea name="hint" required>${escapeHtml(challenge.hint)}</textarea>
      <input name="flag" type="password" placeholder="Leave blank to keep current flag" />
      <input name="points" type="number" min="1" value="${challenge.points}" required />
      <div class="challenge-row-actions">
        <button class="text-button" type="submit">SAVE CHANGES</button>
        <button class="text-button delete-challenge" type="button">DELETE</button>
      </div>
      <p class="form-status" role="status"></p>
    </form>
  `).join('');
  document.querySelectorAll('.admin-challenge-row').forEach((form) => {
    form.addEventListener('submit', (event) => updateChallenge(event, form));
    form.querySelector('.delete-challenge').addEventListener('click', () => deleteChallenge(form));
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
}

async function updateChallenge(event, form) {
  event.preventDefault();
  const statusElement = form.querySelector('.form-status');
  const values = Object.fromEntries(new FormData(form).entries());
  values.id = form.dataset.challengeId;
  values.points = Number(values.points);
  try {
    await adminRequest('/api/challenges', { method: 'PATCH', body: JSON.stringify(values) });
    statusElement.textContent = 'SAVED';
    statusElement.className = 'form-status success';
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
    await loadChallenges();
  } catch (error) {
    window.alert(error.message);
  }
}

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
  document.querySelector('#user-list').innerHTML = users.map((user) => `
    <article class="user-row">
      <div><strong>${escapeHtml(user.full_name)}</strong><small>@${escapeHtml(user.username)} · ${escapeHtml(user.email)}</small></div>
      <div>
        <button class="text-button reset-user" data-user-id="${escapeHtml(user.id)}" type="button">RESET PASSWORD</button>
        <button class="text-button delete-user" data-user-id="${escapeHtml(user.id)}" type="button">DELETE</button>
      </div>
    </article>
  `).join('');
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
  try {
    await adminRequest('/api/challenges', { method: 'POST', body: JSON.stringify(values) });
    form.reset();
    status('CHALLENGE PUBLISHED', 'success');
    await loadChallenges();
  } catch (error) {
    status(error.message);
  }
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
    await supabaseClient.auth.setSession(result);
    session = result;
    await loadUsers();
    await loadChallenges();
    await loadLeaderboard();
    document.querySelector('#admin-login').classList.add('hidden');
    document.querySelector('#admin-auth-loading').classList.add('hidden');
    document.querySelector('#admin-dashboard').classList.remove('hidden');
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
      await loadUsers();
      await loadChallenges();
      await loadLeaderboard();
      document.querySelector('#admin-login').classList.add('hidden');
      document.querySelector('#admin-auth-loading').classList.add('hidden');
      document.querySelector('#admin-dashboard').classList.remove('hidden');
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
