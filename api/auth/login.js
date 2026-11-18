const { supabaseRequest, sendError } = require('../_supabase');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const identifier = typeof request.body?.identifier === 'string'
      ? request.body.identifier.trim()
      : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (!identifier || !password) {
      return response.status(400).json({ error: 'Username/email and password are required' });
    }

    let email = identifier;
    if (!identifier.includes('@')) {
      const profiles = await supabaseRequest(
        `profiles?username=eq.${encodeURIComponent(identifier)}&select=email&limit=1`
      );
      if (!profiles.length) {
        return response.status(401).json({ error: 'Invalid credentials' });
      }
      email = profiles[0].email;
    }

    const authResponse = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      }
    );
    const authBody = await authResponse.json();
    if (!authResponse.ok) {
      return response.status(401).json({
        error: authBody.error_description || authBody.msg || 'Invalid credentials'
      });
    }
    if (!authBody.user?.id) {
      return response.status(401).json({ error: 'Invalid authentication result' });
    }
    const profiles = await supabaseRequest(
      `profiles?id=eq.${encodeURIComponent(authBody.user.id)}&select=role&limit=1`
    );
    if (!profiles.length || profiles[0].role !== 'admin') {
      return response.status(403).json({ error: 'Administrator access required' });
    }
    return response.status(200).json(authBody);
  } catch (error) {
    return sendError(response, error);
  }
};
