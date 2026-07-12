require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const checkoutRoutes = require('./routes/checkout');

// Sem segredo do JWT o app não sobe — evita rodar inseguro por engano.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('\n[ERRO] Defina um JWT_SECRET forte no arquivo .env (copie de .env.example).\n');
  process.exit(1);
}

const app = express();

// Atrás do proxy do Render — para pegar o IP real (rate-limit) e o https.
app.set('trust proxy', 1);

// Cabeçalhos de segurança (CSP, no-sniff, etc.). A CSP padrão do Helmet
// permite apenas recursos da própria origem — por isso o front usa
// arquivos .css e .js externos, sem nada inline.
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '100kb' }));

// Limite de tentativas nas rotas de conta (anti força-bruta).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/checkout', checkoutRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Diz ao frontend se o pagamento com cartão (Stripe) está ativo.
app.get('/api/config', (req, res) => res.json({ stripeEnabled: !!process.env.STRIPE_SECRET_KEY }));

// Frontend (arquivos estáticos).
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🛒 Loja rodando em http://localhost:${PORT}\n`);
});
