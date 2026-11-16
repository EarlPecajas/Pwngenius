const { getAuthenticatedUser, requireAdmin, sendError, supabaseRequest } = require('../_supabase');

module.exports = async function handler(request, response) {
  try {
    await requireAdmin(request);
    if (request.method === 'GET') {
      const [usersResponse, profiles] = await Promise.all([
        fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        }).then((result) => result.json()),
        supabaseRequest('profiles?select=id,full_name,username,role,created_at&order=created_at.desc')
      ]);
      const users = usersResponse.users || [];
      return response.status(200).json({
        users: profiles.map((profile) => ({
          ...profile,
          email: users.find((user) => user.id === profile.id)?.email || ''
        }))
      });
    }

    if (request.method === 'PATCH') {
      const userId = typeof request.body?.userId === 'string' ? request.body.userId : '';
      const password = typeof request.body?.password === 'string' ? request.body.password : '';
      if (!userId || password.length < 8) {
        return response.status(400).json({ error: 'A user ID and password of at least 8 characters are required' });
      }
      const result = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password })
      });
      if (!result.ok) throw new Error(`Password reset failed: ${result.status}`);
      return response.status(200).json({ success: true });
    }

    if (request.method === 'DELETE') {
      const currentUser = await getAuthenticatedUser(request);
      const userId = typeof request.body?.userId === 'string' ? request.body.userId : '';
      if (!userId || userId === currentUser.id) {
        return response.status(400).json({ error: 'A different user must be selected' });
      }
      const result = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
      if (!result.ok) throw new Error(`Account deletion failed: ${result.status}`);
      return response.status(200).json({ success: true });
    }

    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return sendError(response, error);
  }
};
