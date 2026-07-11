const jwt = require('jsonwebtoken');

// Middleware que exige um JWT válido no header Authorization: Bearer <token>.
// Coloca o id do usuário em req.userId para as rotas protegidas usarem.
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Você precisa estar logado.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login de novo.' });
  }
}

module.exports = { authRequired };
