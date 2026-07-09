const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!isEmail(email)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
  if (typeof name !== 'string' || name.trim().length < 2)
    return res.status(400).json({ error: 'Informe seu nome.' });

  const normalizedEmail = email.toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (exists) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });

  // hash com bcrypt (cost 12) — a senha em texto puro nunca é armazenada
  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email: normalizedEmail, name: name.trim(), password: hash },
  });

  return res.status(201).json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  const user = isEmail(email)
    ? await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    : null;

  // Sempre comparamos algo para não vazar por tempo se o e-mail existe ou não,
  // e a mensagem de erro é genérica (não diz se foi o e-mail ou a senha).
  const ok = user && (await bcrypt.compare(String(password || ''), user.password));
  if (!ok) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });

  return res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// GET /api/auth/me  (protegida)
router.get('/me', authRequired, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, name: true, email: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  return res.json({ user });
});

module.exports = router;
