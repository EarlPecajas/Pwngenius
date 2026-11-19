module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const username = typeof request.body?.username === 'string'
    ? request.body.username
    : '';
  const password = typeof request.body?.password === 'string'
    ? request.body.password
    : '';
  const injectedQuery = /(?:['"]\s*)?(?:or|&&)\s*(?:['"]?1['"]?\s*=\s*['"]?1|['"]?[a-z]*['"]?\s*=\s*['"]?[a-z]*['"])/i;
  const tautology = /\bor\s+1\s*=\s*1\b/i;
  const sqlComment = /(?:'|")\s*(?:or\b|--|\#)/i;
  const isSqlInjection = injectedQuery.test(username) || tautology.test(username) ||
    sqlComment.test(username) || injectedQuery.test(password) ||
    tautology.test(password) || sqlComment.test(password);

  if (!isSqlInjection) {
    return response.status(401).json({ error: 'ACCESS DENIED // INVALID CREDENTIALS' });
  }
  if (!process.env.SQLI_FLAG) {
    return response.status(500).json({ error: 'Challenge configuration unavailable' });
  }
  return response.status(200).json({ flag: process.env.SQLI_FLAG });
};
