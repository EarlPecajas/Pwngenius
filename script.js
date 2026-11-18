const loginForm = document.querySelector('#login-form');
const registerForm = document.querySelector('#register-form');
const authStatus = document.querySelector('#auth-status');
const dashboard = document.querySelector('#dashboard');
const challengeList = document.querySelector('#challenge-list');
const adminLink = document.querySelector('#admin-link');
const challengeModal = document.querySelector('#challenge-modal');
const modalSubmissionForm = document.querySelector('#modal-submission-form');
let selectedChallengeId = '';
let currentSession;
let supabaseClient;
let activeChallenge;
let profileCache;
let profileRequest;
let allChallenges = [];
let activeChallengeCategory = 'All';

const difficultyOrder = {
  Easy: 1,
  Medium: 2,
  Hard: 3,
  'Super Hard': 4
};

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
  const { challenges, locked } = await response.json();
  if (locked) {
    document.querySelector('#challenge-filters').classList.add('hidden');
    challengeList.innerHTML = `
      <div class="challenge-lock">
        <span class="challenge-lock-icon">◈</span>
        <h3>CHALLENGES LOCKED</h3>
        <p>The event has not started yet. Stay ready—access will open when the admin unlocks the arena.</p>
      </div>
    `;
    return;
  }
  allChallenges = challenges;
  document.querySelector('#challenge-filters').classList.remove('hidden');
  renderChallengeCards(session);
}

function renderChallengeCards(session) {
  const category = activeChallengeCategory.toLowerCase();
  const visibleChallenges = allChallenges
    .filter((challenge) => category === 'all' || normalizeCategory(challenge.category) === category)
    .sort((a, b) => {
      const difficultyDifference = (difficultyOrder[a.difficulty] || 99) - (difficultyOrder[b.difficulty] || 99);
      return difficultyDifference || a.points - b.points;
    });
  challengeList.innerHTML = visibleChallenges.map((challenge) => `
    <article class="challenge-panel${challenge.solved ? ' solved' : ''}">
      <button class="challenge-card-toggle" type="button" data-challenge-id="${escapeHtml(challenge.id)}">
        <span class="challenge-meta">${escapeHtml(challenge.category)} / ${escapeHtml(challenge.difficulty)}</span>
        <strong>${escapeHtml(challenge.name)}</strong>
        <span class="challenge-score">${challenge.points} PTS</span>
        <span class="challenge-solved${challenge.solved ? '' : ' hidden'}">✓ SOLVED</span>
        <span class="challenge-open">VIEW CHALLENGE <span>↗</span></span>
      </button>
    </article>
  `).join('');
  challengeList.querySelectorAll('.challenge-card-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => openChallengeModal(
      allChallenges.find((challenge) => challenge.id === toggle.dataset.challengeId), session
    ));
  });
}

function normalizeCategory(category) {
  const value = String(category).trim().toLowerCase();
  if (value === 'web' || value === 'web exploit' || value === 'web exploitation') return 'web exploitation';
  if (value === 'crypto' || value === 'cryptography') return 'cryptography';
  return value;
}

document.querySelectorAll('.challenge-filter').forEach((filter) => {
  filter.addEventListener('click', () => {
    activeChallengeCategory = filter.dataset.category;
    document.querySelectorAll('.challenge-filter').forEach((item) => {
      item.classList.toggle('active', item === filter);
    });
    renderChallengeCards(currentSession);
  });
});

function openChallengeModal(challenge, session) {
  activeChallenge = challenge;
  selectedChallengeId = challenge.id;
  document.querySelector('#modal-meta').textContent = `${challenge.category} / ${challenge.difficulty}`;
  document.querySelector('#modal-title').textContent = challenge.name;
  document.querySelector('#modal-points').textContent = `${challenge.points} PTS`;
  document.querySelector('#modal-solved').classList.toggle('hidden', !challenge.solved);
  modalSubmissionForm.classList.toggle('hidden', challenge.solved);
  document.querySelector('#modal-description').textContent = challenge.description;
  document.querySelector('#modal-hint').textContent = `HINT: ${challenge.hint}`;
  document.querySelector('#modal-status').textContent = '';
  modalSubmissionForm.reset();
  challengeModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  modalSubmissionForm.dataset.sessionToken = session.access_token;
}

async function submitFlag(event, form) {
  event.preventDefault();
  const status = document.querySelector('#modal-status');
  const flag = new FormData(form).get('flag').trim();
  status.textContent = 'TRANSMITTING...';
  status.className = 'form-status success';
  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${form.dataset.sessionToken}`
      },
      body: JSON.stringify({ challengeId: selectedChallengeId, flag })
    });
    const result = await response.json();
    status.textContent = result.correct ? 'ANGAS' : 'ENGKKKK';
    status.className = `form-status ${result.correct ? 'success' : 'error'}`;
    if (result.correct) {
      form.reset();
      activeChallenge.solved = true;
      modalSubmissionForm.classList.add('hidden');
      const cardButton = document.querySelector(`[data-challenge-id="${CSS.escape(selectedChallengeId)}"]`);
      const card = cardButton?.closest('.challenge-panel');
      card?.classList.add('solved');
      card?.querySelector('.challenge-solved')?.classList.remove('hidden');
      document.querySelector('#modal-solved').classList.remove('hidden');
    }
  } catch (error) {
    status.textContent = 'ERROR // SUBMISSION SERVICE UNAVAILABLE';
    status.className = 'form-status error';
    console.error(error);
  }
}

window.submitChallengeFlag = submitFlag;

async function showDashboard(session) {
  currentSession = session;
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();
  if (error) throw error;
  document.querySelector('.auth-layout').classList.add('hidden');
  document.querySelector('#auth-loading').classList.add('hidden');
  dashboard.classList.remove('hidden');
  document.querySelector('#account-actions').classList.remove('hidden');
  adminLink.classList.toggle('hidden', profile.role !== 'admin');
  profileRequest = getProfile().catch(() => null);
  await loadChallenges(session);
}

async function getProfile() {
  if (profileCache) return profileCache;
  if (!profileRequest) {
    profileRequest = fetch('/api/profile', {
      headers: { Authorization: `Bearer ${currentSession.access_token}` }
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load profile');
      profileCache = result;
      return result;
    });
  }
  return profileRequest;
}

async function loadProfile() {
  profileCache = null;
  profileRequest = null;
  const result = await getProfile();
  if (!result) throw new Error('Unable to load profile');
  const profile = result.profile || {};
  document.querySelector('#profile-full-name').value = profile.full_name || '';
  document.querySelector('#profile-username').value = profile.username || '';
  document.querySelector('#profile-score').textContent = result.totalScore || 0;
  document.querySelector('#profile-solved').textContent = result.solvedCount || 0;
  renderCategoryChart(result.categoryBreakdown || {});
}

function renderCategoryChart(categoryBreakdown) {
  const chart = document.querySelector('#profile-category-chart');
  const legend = document.querySelector('#profile-category-legend');
  const categories = Object.entries(categoryBreakdown).filter(([, count]) => count > 0);
  const total = categories.reduce((sum, [, count]) => sum + count, 0);

  if (!total) {
    chart.style.background = 'conic-gradient(rgba(120, 134, 157, .12) 0 100%)';
    chart.dataset.label = '0%';
    legend.innerHTML = '<p class="category-empty">NO SOLVED CATEGORIES</p>';
    return;
  }

  const colors = ['#3d8bff', '#70c8ff', '#d7ed4b', '#ff765e', '#a78bfa', '#8cff66'];
  let offset = 0;
  const segments = [];
  const legendItems = [];

  categories.forEach(([category, count], index) => {
    const percentage = (count / total) * 100;
    const end = offset + percentage;
    const color = colors[index % colors.length];
    segments.push(`${color} ${offset}% ${end}%`);
    legendItems.push(`
      <li>
        <span class="category-dot" style="background:${color}"></span>
        <span>${escapeHtml(category)}</span>
        <strong>${count} · ${Math.round(percentage)}%</strong>
      </li>
    `);
    offset = end;
  });

  chart.style.background = `conic-gradient(${segments.join(', ')})`;
  chart.dataset.label = `${total} SOLVED`;
  legend.innerHTML = `<ul>${legendItems.join('')}</ul>`;
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

document.querySelectorAll('.dashboard-nav-button').forEach((button) => {
  button.addEventListener('click', async () => {
    const view = button.dataset.view;
    document.querySelectorAll('.dashboard-nav-button').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('.dashboard-view').forEach((item) => item.classList.add('hidden'));
    document.querySelector(`#${view}-view`).classList.remove('hidden');
    document.querySelector('#dashboard-title').textContent = view[0].toUpperCase() + view.slice(1);
    if (view === 'profile') {
      try { await loadProfile(); } catch (error) { document.querySelector('#profile-status').textContent = error.message; }
    }
  });
});

document.querySelector('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const statusElement = document.querySelector('#profile-status');
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  const response = await fetch('/api/profile', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.access_token}`
    },
    body: JSON.stringify(values)
  });

  function closeChallengeModal() {
    challengeModal.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#close-challenge-modal')) {
      closeChallengeModal();
    }
  });
  challengeModal.addEventListener('click', (event) => {
    if (event.target === challengeModal) closeChallengeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !challengeModal.classList.contains('hidden')) {
      closeChallengeModal();
    }
  });
  const result = await response.json();
  if (response.ok) {
    profileCache = null;
    profileRequest = null;
  }
  statusElement.textContent = response.ok ? 'PROFILE SAVED' : result.error;
  statusElement.className = `form-status ${response.ok ? 'success' : 'error'}`;
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
    if (data.session) {
      await showDashboard(data.session);
    } else {
      document.querySelector('#auth-loading').classList.add('hidden');
      document.querySelector('.auth-layout').classList.remove('hidden');
    }
  } catch (error) {
    document.querySelector('#auth-loading').classList.add('hidden');
    document.querySelector('.auth-layout').classList.remove('hidden');
    showStatus('AUTHENTICATION CONFIGURATION UNAVAILABLE');
    console.error(error);
  }
})();
