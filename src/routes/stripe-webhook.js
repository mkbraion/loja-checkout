const express = require('express');
const { recordPaidCheckout } = require('../paid-checkout');
const router = express.Router();

// A rota precisa receber o corpo bruto antes de express.json().
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send('Webhook não configurado.');
  }
  let event;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send('Assinatura inválida.');
  }
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return res.json({ received: true });
  }
  try {
    await recordPaidCheckout(event.data.object, stripe);
    return res.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook] Falha ao registrar pedido:', err.message);
    // Não confirmar entrega ao Stripe: ele tentará novamente.
    return res.status(500).send('Falha ao registrar pagamento.');
  }
});

module.exports = router;
