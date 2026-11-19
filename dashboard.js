let supabaseClient;
let currentSession;
let allChallenges = [];
let profileCache;
let profileRequest;
let leaderboardPollTimer;
let challengePollTimer;

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
    allChallenges = [];
    list.innerHTML = '<div class="challenge-lock"><span class="challenge-lock-icon">◈</span><h3>CHALLENGES HAVE NOT STARTED</h3><p>Please wait while the admin unlocks the arena.</p></div>';
    return;
  }
  allChallenges = result.challenges;
  renderChallenges();
}

function renderChallenges() {
  const list = document.querySelector('#challenge-list');
  if (!allChallenges.length) {
    list.innerHTML = '<div class="challenge-lock"><span class="challenge-lock-icon">◈</span><h3>NO CHALLENGES PUBLISHED</h3><p>New challenges will appear here when the admin publishes them.</p></div>';
    return;
  }
  const categories = new Map();
  allChallenges.forEach((challenge) => {
    const category = challenge.category || 'General';
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category).push(challenge);
  });
  const difficultyRank = {
    Easy: 1,
    Medium: 2,
    Hard: 3,
    'Super Hard': 4
  };
  categories.forEach((challenges) => {
    challenges.sort((left, right) =>
      (difficultyRank[left.difficulty] || 99) - (difficultyRank[right.difficulty] || 99)
      || (Number(left.points) || 0) - (Number(right.points) || 0)
      || String(left.name).localeCompare(String(right.name))
    );
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
        <span class="challenge-meta">${challenge.submissionLimit ? `${challenge.submissionCount || 0}/${challenge.submissionLimit} SUBMISSIONS` : 'UNLIMITED SUBMISSIONS'}</span>
        ${challenge.files?.length ? `<span class="challenge-meta">${challenge.files.length} DOWNLOADABLE FILE${challenge.files.length === 1 ? '' : 'S'}</span>` : ''}
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
  const hintContainer = document.querySelector('#modal-hint');
  let hints = [];
  if (Array.isArray(challenge.hint)) hints = challenge.hint;
  else if (typeof challenge.hint === 'string') {
    try {
      const parsed = JSON.parse(challenge.hint);
      hints = Array.isArray(parsed) ? parsed : [challenge.hint];
    } catch {
      hints = challenge.hint.trim() ? [challenge.hint] : [];
    }
  }
  hintContainer.innerHTML = hints.length
    ? `<div class="challenge-hint-heading"><span>HINTS</span></div>${hints.map((hint, index) =>
      `<div class="challenge-hint-row">
        <p class="challenge-hint hint-hidden" data-hint="${escapeHtml(hint)}">••••••••••••••••••••••••••••••••</p>
        <button class="hint-toggle" type="button" aria-expanded="false" aria-label="Reveal hint ${index + 1}">
          <svg class="eye-open" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z"></path>
            <circle cx="12" cy="12" r="2.5"></circle>
          </svg>
          <svg class="eye-closed" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z"></path>
            <circle cx="12" cy="12" r="2.5"></circle>
            <path class="eye-slash" d="M4 20 20 4"></path>
          </svg>
        </button>
      </div>`
    ).join('')}`
    : '';
  const filesContainer = document.querySelector('#modal-files');
  filesContainer.innerHTML = challenge.files?.length
    ? `<h3>Challenge Files</h3>${challenge.files.map((file) =>
      `<a href="${escapeHtml(file.url)}?download=${encodeURIComponent(file.name)}" download="${escapeHtml(file.name)}">${escapeHtml(file.name)} <span>↓</span></a>`
    ).join('')}`
    : '';
  document.querySelector('#modal-solved').classList.toggle('hidden', !challenge.solved);
  const submissionLimit = Number.isInteger(challenge.submissionLimit) ? challenge.submissionLimit : null;
  const submissionCount = Number.isInteger(challenge.submissionCount) ? challenge.submissionCount : 0;
  const limitReached = submissionLimit !== null && submissionCount >= submissionLimit;
  const limitStatus = document.querySelector('#modal-submission-limit');
  limitStatus.textContent = submissionLimit === null
    ? 'SUBMISSION LIMIT: UNLIMITED'
    : limitReached
      ? `SUBMISSION LIMIT REACHED — ${submissionCount}/${submissionLimit}`
      : `SUBMISSIONS — ${submissionCount}/${submissionLimit}`;
  limitStatus.className = `submission-limit-status${limitReached ? ' reached' : ''}`;
  document.querySelector('#modal-submission-form').classList.toggle('hidden', challenge.solved || limitReached);
  document.querySelector('#modal-status').textContent = '';
  document.querySelector('#modal-submission-form').dataset.challengeId = challenge.id;
  document.querySelector('#challenge-modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}

document.querySelector('#modal-files').addEventListener('click', (event) => {
  const link = event.target.closest('a[download]');
  if (!link) return;
  event.preventDefault();
  fetch(link.href)
    .then((response) => {
      if (!response.ok) throw new Error('Unable to download file');
      return response.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const download = document.createElement('a');
      download.href = url;
      download.download = link.download;
      document.body.appendChild(download);
      download.click();
      download.remove();
      URL.revokeObjectURL(url);
    })
    .catch(() => {
      window.location.href = link.href;
    });
});

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
    if (result.hidden) {
      container.innerHTML = '<p class="category-empty leaderboard-hidden-message">LEADERBOARD IS HIDDEN BY THE ADMIN</p>';
      return;
    }
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
    if (challengePollTimer) {
      window.clearInterval(challengePollTimer);
      challengePollTimer = null;
    }
    if (leaderboardPollTimer) {
      window.clearInterval(leaderboardPollTimer);
      leaderboardPollTimer = null;
    }
    document.querySelectorAll('.dashboard-nav-button').forEach((item) =>
      item.classList.toggle('active', item === button)
    );
    document.querySelectorAll('.dashboard-view').forEach((item) => item.classList.add('hidden'));
    document.querySelector(`#${view}-view`).classList.remove('hidden');
    document.querySelector('#dashboard-title').textContent =
      view === 'leaderboard' ? 'Leaderboard' : view[0].toUpperCase() + view.slice(1);
    if (view === 'challenges') {
      await loadChallenges();
      challengePollTimer = window.setInterval(() => {
        loadChallenges().catch((error) => console.error(error));
      }, 5000);
    }
    if (view === 'profile') await loadProfile();
    if (view === 'leaderboard') {
      await loadLeaderboard();
      leaderboardPollTimer = window.setInterval(() => {
        loadLeaderboard().catch((error) => console.error(error));
      }, 3000);
    }
  });
});

document.querySelector('#modal-hint').addEventListener('click', (event) => {
  const toggle = event.target.closest('.hint-toggle');
  if (!toggle) return;
  const row = toggle.closest('.challenge-hint-row');
  const hintText = row.querySelector('.challenge-hint');
  const revealed = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!revealed));
  toggle.setAttribute('aria-label', revealed ? 'Reveal hint' : 'Hide hint');
  if (revealed) {
    hintText.textContent = '••••••••••••••••••••••••••••••••';
  } else {
    hintText.textContent = hintText.dataset.hint;
  }
  hintText.classList.toggle('hint-hidden', revealed);
  hintText.classList.toggle('hint-visible', !revealed);
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
          <p>I'm <strong>Earl Warren Pecajas</strong>, a cybersecurity enthusiast, CTF player, and developer who enjoys exploring the technical side of things, solving complex problems, and understanding what happens behind the scenes. My interest in cybersecurity comes from the curiosity to discover how systems work, how vulnerabilities can be uncovered, and how seemingly ordinary pieces of information can reveal something much bigger.</p>
          <p>My primary areas of interest are Digital Forensics and Web Exploitation. I enjoy digging through digital evidence, examining artifacts, uncovering hidden information, and investigating traces left behind. On the web exploitation side, I find it fascinating to understand how web applications function, identify security weaknesses, and explore how they can be exploited.</p>
          <p>Capture The Flag competitions have become a way for me to put these interests into practice. Every challenge presents a different problem, requiring patience, creativity, critical thinking, and sometimes a completely different perspective. I believe that every challenge, whether solved or not, offers an opportunity to learn something new and improve along the way.</p>
          <p>Beyond competing, I also enjoy creating and sharing challenges that encourage others to explore cybersecurity, sharpen their skills, and experience the satisfaction of finding a solution.</p>
          <blockquote>“Curiosity leads the way. Persistence finds the flag."</blockquote>
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
    } else if (button.dataset.profile === 'aladdin') {
      modalContent.innerHTML = `
        <div class="creator-bio">
          <p>Hey! I'm <strong>Aladdin S. Abedin</strong>, an Information Technology student majoring in Database Systems, a cybersecurity enthusiast, and a developer who loves exploring how things work behind the screen.</p>
          <p>My interests revolve around Cybersecurity, Capture The Flag (CTF), Web Development, and Software Engineering. I enjoy solving complex problems, exploring vulnerabilities, analyzing systems, and turning ideas into functional projects. For me, every challenge is an opportunity to learn something new, think differently, and improve my skills.</p>
          <p>Beyond cybersecurity, I also enjoy building applications, working with databases, experimenting with new technologies, and collaborating with people who share the same passion for innovation.</p>
          <p>I believe that cybersecurity isn't just about finding vulnerabilities, it's about understanding how systems work, thinking outside the box, and using knowledge responsibly.</p>
          <p>Keep learning. Keep exploring. Keep hacking ethically.</p>
          <blockquote>“Every system has a story. Every vulnerability has a lesson. And every challenge has a solution”</blockquote>
        </div>
        <section class="creator-certifications">
          <h3>Certifications</h3>
          <div class="certification-grid creator-certification-grid-three">
            <img src="/CERTS%20LOGOS/CCP.png" alt="" />
            <img src="/CERTS%20LOGOS/CAISP.png" alt="" />
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
    if (!response.ok) {
      status.textContent = result.error || 'SUBMISSION FAILED';
      status.className = 'form-status error';
    } else {
      status.textContent = result.correct ? 'ANGASS' : 'ENGKKK';
      status.className = `form-status ${result.correct ? 'success' : 'error'}`;
    }
    const challenge = allChallenges.find((item) => item.id === form.dataset.challengeId);
    if (challenge) {
      challenge.submissionCount = (challenge.submissionCount || 0) + 1;
      if (result.correct) challenge.solved = true;
      renderChallenges();
    }
    if (result.correct) {
      document.querySelector('#challenge-modal').classList.add('hidden');
      document.body.classList.remove('modal-open');
    } else if (challenge?.submissionLimit) {
      const limitReached = challenge.submissionCount >= challenge.submissionLimit;
      const limitStatus = document.querySelector('#modal-submission-limit');
      limitStatus.textContent = limitReached
        ? `SUBMISSION LIMIT REACHED — ${challenge.submissionCount}/${challenge.submissionLimit}`
        : `SUBMISSIONS — ${challenge.submissionCount}/${challenge.submissionLimit}`;
      limitStatus.className = `submission-limit-status${limitReached ? ' reached' : ''}`;
      if (limitReached) form.classList.add('hidden');
    }
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
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    if (!configResponse.ok) throw new Error(config.error || 'Authentication configuration unavailable');
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data } = await supabaseClient.auth.getSession();
    if (!data.session) {
      window.location.replace('/');
      return;
    }
    currentSession = data.session;
    try {
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .maybeSingle();
      document.querySelector('#admin-link').classList.toggle('hidden', profile?.role !== 'admin');
    } catch {
      document.querySelector('#admin-link').classList.add('hidden');
    }
    document.querySelector('#dashboard-loading').classList.add('hidden');
    document.querySelector('#dashboard').classList.remove('hidden');
  } catch (error) {
    document.querySelector('#dashboard-loading').classList.add('hidden');
    document.querySelector('#dashboard').classList.remove('hidden');
    document.querySelector('#dashboard-title').textContent = 'Session unavailable';
    document.querySelectorAll('.dashboard-view').forEach((view) => view.classList.add('hidden'));
    console.error(error);
  }
})();
