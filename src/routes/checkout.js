const express = require('express');
const prisma = require('../prisma');
const { authRequired } = require('../middleware/auth');
const { normalizeCart } = require('../cart');
const { recordPaidCheckout } = require('../paid-checkout');

const router = express.Router();

// Só cria o cliente Stripe se a chave estiver configurada.
function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function baseUrl(req) {
  // Em produção, não confie no cabeçalho Host para gerar URLs do Stripe.
  if (process.env.PUBLIC_URL) {
    const url = new URL(process.env.PUBLIC_URL);
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
      throw new Error('PUBLIC_URL deve usar HTTPS.');
    }
    return url.origin;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Configure PUBLIC_URL para ativar pagamentos.');
  return `${req.protocol}://${req.get('host')}`;
}

// Valida os itens e calcula o total com o preço do BANCO (nunca do cliente).
async function priceCart(items) {
  const wanted = normalizeCart(items);
  if (!wanted) return null;
  const products = await prisma.product.findMany({ where: { id: { in: [...wanted.keys()] } } });
  if (products.length !== wanted.size) return null;
  let total = 0;
  const lines = products.map((p) => {
    const qty = wanted.get(p.id);
    total += p.price * qty;
    return { product: p, qty };
  });
  return { lines, total };
}

// POST /api/checkout — cria a sessão de pagamento no Stripe.
router.post('/', authRequired, async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.status(400).json({ error: 'Pagamento com cartão não está configurado.' });

  const cart = await priceCart(req.body && req.body.items);
  if (!cart) return res.status(400).json({ error: 'Carrinho inválido.' });

  let origin;
  try { origin = baseUrl(req); }
  catch { return res.status(503).json({ error: 'URL pública de pagamento não configurada corretamente.' }); }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: cart.lines.map(({ product, qty }) => ({
      quantity: qty,
      price_data: {
        currency: 'brl',
        unit_amount: product.price, // centavos, vindos do banco
        product_data: { name: product.name },
      },
    })),
    metadata: {
      userId: req.userId,
      items: JSON.stringify(cart.lines.map(({ product, qty }) => ({ id: product.id, qty }))),
    },
    success_url: `${origin}/api/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?pagamento=cancelado`,
  });

  res.json({ url: session.url });
});

// GET /api/checkout/confirm — o Stripe redireciona o cliente para cá após pagar.
// Só criamos o pedido depois de confirmar com o Stripe que foi pago.
router.get('/confirm', async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.redirect('/?pagamento=erro');
  try {
    const session = await stripe.checkout.sessions.retrieve(String(req.query.session_id || ''));
    if (!session || session.payment_status !== 'paid') return res.redirect('/?pagamento=falhou');

    await recordPaidCheckout(session, stripe);
    res.redirect('/?pagamento=ok');
  } catch (e) {
    res.redirect('/?pagamento=erro');
  }
});

module.exports = router;
