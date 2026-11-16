let supabaseClient;
let session;

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
  } catch (error) {
    status(error.message);
  }
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = '/';
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
    if (!session) throw new Error('Please log in first');
    await loadUsers();
  } catch (error) {
    document.querySelector('#user-list').textContent = error.message;
  }
})();
