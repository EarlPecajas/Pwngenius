let supabaseClient;
let currentSession;
let allChallenges = [];
let profileCache;
let profileRequest;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[character]));
}

async function loadChallenges() {
  const response = await fetch('/api/challenges', {
    headers: { Authorization: `Bearer ${currentSession.access_token}` }
  });
  if (!response.ok) throw new Error('Unable to load challenges');
  const result = await response.json();
  const list = document.querySelector('#challenge-list');
  if (result.locked) {
    list.innerHTML = '<div class="challenge-lock"><span class="challenge-lock-icon">◈</span><h3>CHALLENGES LOCKED</h3><p>The event has not started yet.</p></div>';
    return;
  }
  allChallenges = result.challenges;
  renderChallenges();
}

function renderChallenges() {
  const list = document.querySelector('#challenge-list');
  const categories = new Map();
  allChallenges.forEach((challenge) => {
    const category = challenge.category || 'General';
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category).push(challenge);
  });
  list.innerHTML = [...categories.entries()].map(([category, challenges]) => `
    <section class="challenge-category-section">
      <div class="challenge-category-heading">
        <h2>${escapeHtml(category)}</h2>
      </div>
      <div class="challenge-category-grid">
        ${challenges.map((challenge) => `
    <article class="challenge-panel${challenge.solved ? ' solved' : ''}">
      <button class="challenge-card-toggle" type="button" data-challenge-id="${escapeHtml(challenge.id)}">
        <span class="challenge-meta">${escapeHtml(challenge.category)} / ${escapeHtml(challenge.difficulty)}</span>
        <strong>${escapeHtml(challenge.name)}</strong>
        <span class="challenge-score">${challenge.points} PTS</span>
        <span class="challenge-solved${challenge.solved ? '' : ' hidden'}">✓ SOLVED</span>
        <span class="challenge-open">VIEW CHALLENGE <span>↗</span></span>
      </button>
    </article>
        `).join('')}
      </div>
    </section>
  `).join('');
  list.querySelectorAll('.challenge-card-toggle').forEach((button) => {
    button.addEventListener('click', () => openChallenge(
      allChallenges.find((challenge) => challenge.id === button.dataset.challengeId)
    ));
  });
}

function openChallenge(challenge) {
  document.querySelector('#modal-meta').textContent = `${challenge.category} / ${challenge.difficulty}`;
  document.querySelector('#modal-title').textContent = challenge.name;
  document.querySelector('#modal-points').textContent = `${challenge.points} PTS`;
  document.querySelector('#modal-description').textContent = challenge.description;
  document.querySelector('#modal-hint').textContent = `HINT: ${challenge.hint}`;
  document.querySelector('#modal-solved').classList.toggle('hidden', !challenge.solved);
  document.querySelector('#modal-submission-form').classList.toggle('hidden', challenge.solved);
  document.querySelector('#modal-status').textContent = '';
  document.querySelector('#modal-submission-form').dataset.challengeId = challenge.id;
  document.querySelector('#challenge-modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}

async function loadProfile() {
  profileCache = null;
  profileRequest = null;
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
  const result = await profileRequest;
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
    chart.dataset.label = '0 SOLVED';
    legend.innerHTML = '<p class="category-empty">NO SOLVED CATEGORIES</p>';
    return;
  }
  const colors = ['#3d8bff', '#70c8ff', '#d7ed4b', '#ff765e', '#a78bfa', '#8cff66'];
  let offset = 0;
  const segments = [];
  const legendItems = [];
  categories.forEach(([category, count], index) => {
    const percentage = count / total * 100;
    const end = offset + percentage;
    const color = colors[index % colors.length];
    segments.push(`${color} ${offset}% ${end}%`);
    legendItems.push(`<li><span class="category-dot" style="background:${color}"></span><span>${escapeHtml(category)}</span><strong>${count} · ${Math.round(percentage)}%</strong></li>`);
    offset = end;
  });
  chart.style.background = `conic-gradient(${segments.join(', ')})`;
  chart.dataset.label = `${total} SOLVED`;
  legend.innerHTML = `<ul>${legendItems.join('')}</ul>`;
}

async function loadLeaderboard() {
  const container = document.querySelector('#public-leaderboard-list');
  container.innerHTML = '<p class="category-empty">LOADING LEADERBOARD...</p>';
  try {
    const response = await fetch('/api/leaderboard', {
      headers: { Authorization: `Bearer ${currentSession.access_token}` }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    container.innerHTML = result.leaderboard.length
      ? result.leaderboard.map((player, index) => `
        <article class="public-leaderboard-row${isCurrentPlayer(player.username, result.currentUsername) ? ' current-player' : ''}">
          <span class="leaderboard-rank">${String(index + 1).padStart(2, '0')}</span>
          <strong>@${escapeHtml(player.username)}${isCurrentPlayer(player.username, result.currentUsername) ? '<span class="current-player-badge">YOU</span>' : ''}</strong>
          <strong class="leaderboard-score">${player.score} PTS</strong>
        </article>
      `).join('')
      : '<p class="category-empty">NO SCORES YET</p>';
  } catch (error) {
    container.innerHTML = `<p class="form-status error">${escapeHtml(error.message)}</p>`;
  }
}

function isCurrentPlayer(username, currentUsername) {
  return String(username).toLowerCase() === String(currentUsername).toLowerCase();
}

document.querySelectorAll('.dashboard-nav-button').forEach((button) => {
  button.addEventListener('click', async () => {
    const view = button.dataset.view;
    document.querySelectorAll('.dashboard-nav-button').forEach((item) =>
      item.classList.toggle('active', item === button)
    );
    document.querySelectorAll('.dashboard-view').forEach((item) => item.classList.add('hidden'));
    document.querySelector(`#${view}-view`).classList.remove('hidden');
    document.querySelector('#dashboard-title').textContent =
      view === 'leaderboard' ? 'Leaderboard' : view[0].toUpperCase() + view.slice(1);
    if (view === 'challenges') await loadChallenges();
    if (view === 'profile') await loadProfile();
    if (view === 'leaderboard') await loadLeaderboard();
  });
});

document.querySelector('#close-challenge-modal').addEventListener('click', () => {
  document.querySelector('#challenge-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
});

document.querySelectorAll('.creator-about-button').forEach((button) => {
  button.addEventListener('click', () => {
    const modalContent = document.querySelector('.creator-modal-content');
    if (button.dataset.profile === 'earl') {
      modalContent.innerHTML = `
        <div class="creator-bio">
          <p>I'm <strong>Earl Warren Pecajas</strong>, a cybersecurity enthusiast, CTF player, and developer with a passion for exploring how things work, solving problems, and building things that challenge people to think differently.</p>
          <p>My main interests are Digital Forensics and Web Exploitation. I enjoy investigating clues, uncovering hidden information, analyzing digital evidence, and finding vulnerabilities through hands-on challenges.</p>
          <p>For me, cybersecurity isn't just about solving challenges. It's about continuously learning, experimenting, and discovering new ways to approach problems.</p>
          <blockquote>“Curiosity leads the way. Persistence finds the flag.”</blockquote>
        </div>
        <section class="creator-certifications">
          <h3>Certifications</h3>
          <div class="certification-grid">
            <img src="/CERTS%20LOGOS/CAISP.png" alt="" />
            <img src="/CERTS%20LOGOS/CCP.png" alt="" />
            <img src="/CERTS%20LOGOS/CLES.png" alt="" />
            <img src="/CERTS%20LOGOS/CNPS.png" alt="" />
            <img src="/CERTS%20LOGOS/COAP.png" alt="" />
            <img src="/CERTS%20LOGOS/CWPT.png" alt="" />
            <img src="/CERTS%20LOGOS/IT%20SUPPORT.png" alt="" />
            <img src="/CERTS%20LOGOS/NETOPS.png" alt="" />
            <img src="/CERTS%20LOGOS/WINOPS.png" alt="" />
          </div>
        </section>
      `;
    } else {
      modalContent.innerHTML = '';
    }
    document.querySelector('#creator-modal').classList.remove('hidden');
    document.body.classList.add('modal-open');
  });
});

document.querySelector('#close-creator-modal').addEventListener('click', () => {
  document.querySelector('#creator-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
});

document.querySelector('#creator-modal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) {
    event.currentTarget.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.querySelector('#creator-modal').classList.contains('hidden')) {
    document.querySelector('#creator-modal').classList.add('hidden');
    document.body.classList.remove('modal-open');
  }
});

document.querySelector('#modal-submission-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#modal-status');
  status.textContent = 'TRANSMITTING...';
  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify({
        challengeId: form.dataset.challengeId,
        flag: new FormData(form).get('flag').trim()
      })
    });
    const result = await response.json();
    status.textContent = result.correct ? 'ANGASSS' : 'ENGKKK';
    status.className = `form-status ${result.correct ? 'success' : 'error'}`;
    if (result.correct) await loadChallenges();
  } catch (error) {
    status.textContent = 'SUBMISSION SERVICE UNAVAILABLE';
  }
});

document.querySelector('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('#profile-status');
  const response = await fetch('/api/profile', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.access_token}`
    },
    body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()))
  });
  const result = await response.json();
  status.textContent = response.ok ? 'PROFILE SAVED' : result.error;
  status.className = `form-status ${response.ok ? 'success' : 'error'}`;
  if (response.ok) await loadProfile();
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.replace('/');
});

(async () => {
  try {
    const config = await fetch('/api/config').then((response) => response.json());
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data } = await supabaseClient.auth.getSession();
    if (!data.session) {
      window.location.replace('/');
      return;
    }
    currentSession = data.session;
    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', data.session.user.id)
      .single();
    if (error) throw error;
    document.querySelector('#admin-link').classList.toggle('hidden', profile.role !== 'admin');
    document.querySelector('#dashboard-loading').classList.add('hidden');
    document.querySelector('#dashboard').classList.remove('hidden');
  } catch (error) {
    window.location.replace('/');
  }
})();
