const express = require('express');
const prisma = require('../prisma');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// Só cria o cliente Stripe se a chave estiver configurada.
function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return process.env.PUBLIC_URL || `${proto}://${req.get('host')}`;
}

// Valida os itens e calcula o total com o preço do BANCO (nunca do cliente).
async function priceCart(items) {
  const wanted = new Map();
  for (const it of items || []) {
    const id = String((it && it.productId) || '');
    const qty = Math.floor(Number(it && it.quantity));
    if (!id || !Number.isFinite(qty) || qty < 1 || qty > 99) return null;
    wanted.set(id, (wanted.get(id) || 0) + qty);
  }
  if (wanted.size === 0) return null;
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
    success_url: `${baseUrl(req)}/api/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl(req)}/?pagamento=cancelado`,
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

    // idempotência: não recria se já registramos este pagamento.
    const existing = await prisma.order.findFirst({ where: { paymentId: session.id } });
    if (existing) return res.redirect('/?pagamento=ok');

    const items = JSON.parse(session.metadata.items || '[]').map((i) => ({ productId: i.id, quantity: i.qty }));
    const cart = await priceCart(items);
    if (!cart) return res.redirect('/?pagamento=erro');

    await prisma.order.create({
      data: {
        userId: session.metadata.userId,
        total: cart.total,
        status: 'pago',
        paymentId: session.id,
        items: {
          create: cart.lines.map(({ product, qty }) => ({
            productId: product.id, name: product.name, price: product.price, quantity: qty,
          })),
        },
      },
    });
    res.redirect('/?pagamento=ok');
  } catch (e) {
    res.redirect('/?pagamento=erro');
  }
});

module.exports = router;
