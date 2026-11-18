const loginForm = document.querySelector('#login-form');
const registerForm = document.querySelector('#register-form');
const authStatus = document.querySelector('#auth-status');
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
    window.location.href = '/dashboard.html';
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
    window.location.href = '/dashboard.html';
  } else {
    showStatus('ACCOUNT CREATED // CHECK YOUR EMAIL TO CONFIRM', 'success');
    setAuthMode('login');
  }
});

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => setAuthMode(tab.dataset.mode));
});

(async () => {
  try {
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    if (!configResponse.ok) throw new Error(config.error || 'Authentication configuration unavailable');
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) {
      window.location.replace('/dashboard.html');
      return;
    }
    document.querySelector('#auth-loading').classList.add('hidden');
    document.querySelector('.auth-layout').classList.remove('hidden');
  } catch (error) {
    document.querySelector('#auth-loading').classList.add('hidden');
    document.querySelector('.auth-layout').classList.remove('hidden');
    showStatus('AUTHENTICATION CONFIGURATION UNAVAILABLE');
    console.error(error);
  }
})();
