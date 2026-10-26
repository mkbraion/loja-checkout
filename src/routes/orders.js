const express = require('express');
const prisma = require('../prisma');
const { authRequired } = require('../middleware/auth');
const { normalizeCart } = require('../cart');

const router = express.Router();

// Simulação de cobrança. Em produção, aqui entra o provedor de pagamento
// (ex.: Stripe PaymentIntent). Veja o README para o passo a passo.
async function processPayment(amountCents) {
  return { ok: true, id: 'sim_' + Date.now() };
}

// POST /api/orders — finaliza a compra (protegida)
router.post('/', authRequired, async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'Seu carrinho está vazio.' });

  const wanted = normalizeCart(items);
  if (!wanted) return res.status(400).json({ error: 'Há um item inválido no carrinho.' });

  // Busca os produtos reais no banco.
  const products = await prisma.product.findMany({ where: { id: { in: [...wanted.keys()] } } });
  if (products.length !== wanted.size)
    return res.status(400).json({ error: 'Algum produto do carrinho não existe mais.' });

  // === SEGURANÇA: o total é calculado com o preço do BANCO, nunca com o
  // preço enviado pelo cliente. Assim ninguém adultera o valor da compra. ===
  let total = 0;
  const orderItems = products.map((p) => {
    const qty = wanted.get(p.id);
    total += p.price * qty;
    return { productId: p.id, name: p.name, price: p.price, quantity: qty };
  });

  const payment = await processPayment(total);
  if (!payment.ok) return res.status(402).json({ error: 'Pagamento recusado.' });

  const order = await prisma.order.create({
    data: {
      userId: req.userId,
      total,
      status: 'simulado',
      items: { create: orderItems },
    },
    include: { items: true },
  });

  return res.status(201).json({ order });
});

// GET /api/orders — pedidos do usuário logado (protegida)
router.get('/', authRequired, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.userId }, // só os pedidos DELE
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });
  res.json({ orders });
});

module.exports = router;
