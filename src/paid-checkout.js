const prisma = require('./prisma');
const { normalizeCart } = require('./cart');

// Confirma pagamentos reais do Stripe. O índice único paymentId impede
// pedidos duplicados quando webhook e retorno do navegador concorrem.
async function recordPaidCheckout(session) {
  if (!session || session.mode !== 'payment' || session.payment_status !== 'paid' ||
      session.currency !== 'brl' || !session.id || !session.metadata?.userId) {
    throw new Error('Sessão de pagamento inválida ou não paga.');
  }
  const existing = await prisma.order.findUnique({ where: { paymentId: session.id } });
  if (existing) return existing;

  let items;
  try { items = JSON.parse(session.metadata.items || 'null'); }
  catch { throw new Error('Itens da sessão inválidos.'); }
  if (!Array.isArray(items)) throw new Error('Itens da sessão inválidos.');
  const wanted = normalizeCart(items.map((item) => ({ productId: item.id, quantity: item.qty })));
  if (!wanted) throw new Error('Carrinho da sessão inválido.');
  const products = await prisma.product.findMany({ where: { id: { in: [...wanted.keys()] } } });
  if (products.length !== wanted.size) throw new Error('Produtos da sessão não encontrados.');
  const total = products.reduce((sum, p) => sum + p.price * wanted.get(p.id), 0);
  // Evita registrar um pedido com total diferente do valor pago no Stripe.
  if (!Number.isSafeInteger(total) || total !== session.amount_total) {
    throw new Error('Total atual diverge do pagamento confirmado.');
  }
  try {
    return await prisma.order.create({
      data: {
        userId: session.metadata.userId,
        total,
        status: 'pago',
        paymentId: session.id,
        items: { create: products.map((p) => ({
          productId: p.id, name: p.name, price: p.price, quantity: wanted.get(p.id),
        })) },
      },
    });
  } catch (err) {
    // Concorrência entre retorno e webhook: a constraint única resolve a corrida.
    if (err.code === 'P2002') {
      const order = await prisma.order.findUnique({ where: { paymentId: session.id } });
      if (order) return order;
    }
    throw err;
  }
}

module.exports = { recordPaidCheckout };
