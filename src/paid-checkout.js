const prisma = require('./prisma');
const { normalizeCart } = require('./cart');

// Confirma pagamentos reais do Stripe. O índice único paymentId impede
// pedidos duplicados quando webhook e retorno do navegador concorrem.
async function recordPaidCheckout(session, stripe) {
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

  // Recupera os preços cobrados pelo Stripe, não os preços atuais do catálogo.
  const response = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
  if (response.has_more || response.data.length !== items.length) {
    throw new Error('Quantidade de itens Stripe inconsistente.');
  }
  const lines = response.data.map((line, index) => {
    const item = items[index];
    const product = products.find((p) => p.id === item.id);
    const price = line.price && line.price.unit_amount;
    if (!product || line.quantity !== item.qty || line.currency !== 'brl' ||
        !Number.isSafeInteger(price) || price < 0 ||
        !Number.isSafeInteger(line.amount_total) || line.amount_total !== price * item.qty) {
      throw new Error('Item Stripe inconsistente.');
    }
    return { productId: product.id, name: line.description || product.name,
      price, quantity: item.qty };
  });
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  if (!Number.isSafeInteger(total) || total !== session.amount_total) {
    throw new Error('Total pago diverge dos itens Stripe.');
  }
  try {
    return await prisma.order.create({
      data: {
        userId: session.metadata.userId,
        total,
        status: 'pago',
        paymentId: session.id,
        items: { create: lines },
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
