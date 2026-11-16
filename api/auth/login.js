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
        `profiles?username=eq.${encodeURIComponent(identifier)}&select=id&limit=1`
      );
      if (!profiles.length) {
        return response.status(401).json({ error: 'Invalid credentials' });
      }
      const users = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
      const userData = await users.json();
      const user = userData.users?.find((item) => item.id === profiles[0].id);
      email = user?.email || '';
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
    return response.status(200).json(authBody);
  } catch (error) {
    return sendError(response, error);
  }
};
