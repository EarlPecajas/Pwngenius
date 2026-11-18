async function supabaseRequest(path, options = {}) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error('Supabase server configuration is missing');
    error.statusCode = 500;
    throw error;
  }
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status} ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

async function supabaseStorageRequest(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {})
    }
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase Storage request failed: ${response.status} ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

function getAccessToken(request) {
  const value = request.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function getAuthenticatedUser(request) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    const error = new Error('Supabase authentication configuration is missing');
    error.statusCode = 500;
    throw error;
  }
  const token = getAccessToken(request);
  if (!token) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }

  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    const error = new Error('Invalid authentication token');
    error.statusCode = 401;
    throw error;
  }
  return response.json();
}

async function requireAdmin(request) {
  const user = await getAuthenticatedUser(request);
  const profiles = await supabaseRequest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`);
  if (!profiles.length || profiles[0].role !== 'admin') {
    const error = new Error('Administrator access required');
    error.statusCode = 403;
    throw error;
  }
  return user;
}

function sendError(response, error) {
  console.error(error);
  return response.status(error.statusCode || 500).json({
    error: error.message || 'Service unavailable'
  });
}

module.exports = {
  getAuthenticatedUser,
  requireAdmin,
  sendError,
  supabaseRequest,
  supabaseStorageRequest
};
