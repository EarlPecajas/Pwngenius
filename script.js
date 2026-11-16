const loginForm = document.querySelector('#login-form');
const registerForm = document.querySelector('#register-form');
const authStatus = document.querySelector('#auth-status');
const dashboard = document.querySelector('#dashboard');
const challengeList = document.querySelector('#challenge-list');
const adminLink = document.querySelector('#admin-link');
let supabaseClient;

function showStatus(message, type = 'error') {
  authStatus.textContent = message;
  authStatus.className = `form-status ${type}`;
}

function setAuthMode(mode) {
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });
  loginForm.classList.toggle('hidden', mode !== 'login');
  registerForm.classList.toggle('hidden', mode !== 'register');
  showStatus('');
}

async function loadChallenges(session) {
  const response = await fetch('/api/challenges', {
    headers: { Authorization: `Bearer ${session.access_token}` }
  });
  if (!response.ok) throw new Error('Unable to load challenges');
  const { challenges } = await response.json();
  challengeList.innerHTML = challenges.map((challenge) => `
    <article class="challenge-panel">
      <div class="challenge-meta">${escapeHtml(challenge.category)} / ${escapeHtml(challenge.difficulty)}</div>
      <h3>${escapeHtml(challenge.name)}</h3>
      <p>${escapeHtml(challenge.description)}</p>
      <p class="challenge-hint"><strong>HINT:</strong> ${escapeHtml(challenge.hint)}</p>
      <form class="submission-form" data-challenge-id="${escapeHtml(challenge.id)}">
        <label>FLAG STRING</label>
        <div class="input-wrap"><span class="input-prefix">$</span><input name="flag" required autocomplete="off" /></div>
        <button class="submit-button" type="submit"><span>TRANSMIT FLAG</span><span>↗</span></button>
        <p class="form-status" role="status"></p>
      </form>
    </article>
  `).join('');
  challengeList.querySelectorAll('.submission-form').forEach((form) => {
    form.addEventListener('submit', (event) => submitFlag(event, form, session));
  });
}

async function submitFlag(event, form, session) {
  event.preventDefault();
  const status = form.querySelector('.form-status');
  const flag = new FormData(form).get('flag').trim();
  const response = await fetch('/api/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ challengeId: form.dataset.challengeId, flag })
  });
  const result = await response.json();
  status.textContent = result.correct ? 'CORRECT // FLAG ACCEPTED' : 'INCORRECT // FLAG REJECTED';
  status.className = `form-status ${result.correct ? 'success' : 'error'}`;
  if (result.correct) form.reset();
}

async function showDashboard(session) {
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();
  if (error) throw error;
  document.querySelector('.auth-layout').classList.add('hidden');
  dashboard.classList.remove('hidden');
  adminLink.classList.toggle('hidden', profile.role !== 'admin');
  await loadChallenges(session);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showStatus('AUTHENTICATING...', 'success');
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: document.querySelector('#login-identifier').value,
        password: document.querySelector('#login-password').value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    await supabaseClient.auth.setSession(result);
    await showDashboard(result);
  } catch (error) {
    showStatus(error.message || 'LOGIN FAILED');
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = document.querySelector('#register-password').value;
  if (password !== document.querySelector('#register-confirm').value) {
    showStatus('PASSWORDS DO NOT MATCH');
    return;
  }
  showStatus('CREATING ACCOUNT...', 'success');
  const { data, error } = await supabaseClient.auth.signUp({
    email: document.querySelector('#register-email').value,
    password,
    options: {
      data: {
        full_name: document.querySelector('#register-full-name').value.trim(),
        username: document.querySelector('#register-username').value.trim()
      }
    }
  });
  if (error) {
    showStatus(error.message);
  } else if (data.session) {
    await showDashboard(data.session);
  } else {
    showStatus('ACCOUNT CREATED // CHECK YOUR EMAIL TO CONFIRM', 'success');
    setAuthMode('login');
  }
});

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => setAuthMode(tab.dataset.mode));
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.reload();
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
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) await showDashboard(data.session);
  } catch (error) {
    showStatus('AUTHENTICATION CONFIGURATION UNAVAILABLE');
    console.error(error);
  }
})();
