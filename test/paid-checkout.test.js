'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Isola o banco: nenhum teste exige credenciais ou acessa dados reais.
const prismaPath = require.resolve('../src/prisma');
const records = new Map();
let currentPrice = 15000;
const fakePrisma = {
  order: {
    findUnique: async ({ where }) => records.get(where.paymentId) || null,
    create: async ({ data }) => {
      if (records.has(data.paymentId)) { const err = new Error('Duplicado'); err.code = 'P2002'; throw err; }
      const order = { id: 'order-test', ...data };
      records.set(data.paymentId, order);
      return order;
    },
  },
  product: { findMany: async () => [{ id: 'prod1', name: 'Produto atualizado', price: currentPrice }] },
};
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
const { recordPaidCheckout } = require('../src/paid-checkout');

const stripe = {
  checkout: { sessions: { listLineItems: async () => ({ has_more: false, data: [{
    quantity: 2, currency: 'brl', amount_total: 20000,
    description: 'Produto na compra', price: { unit_amount: 10000 },
  }] }) } },
};
function session(id = 'cs_test_ok') {
  return { id, mode: 'payment', payment_status: 'paid', currency: 'brl',
    amount_total: 20000, metadata: { userId: 'user1', items: JSON.stringify([{ id: 'prod1', qty: 2 }]) } };
}

test('preserva preço pago quando catálogo muda', async () => {
  records.clear(); currentPrice = 15000;
  const order = await recordPaidCheckout(session(), stripe);
  assert.equal(order.total, 20000);
  assert.equal(order.items.create[0].price, 10000);
  assert.equal(order.items.create[0].name, 'Produto na compra');
  assert.equal(order.status, 'pago');
});

test('repetição do webhook não duplica pedido', async () => {
  records.clear();
  const first = await recordPaidCheckout(session(), stripe);
  const second = await recordPaidCheckout(session(), stripe);
  assert.equal(second, first);
  assert.equal(records.size, 1);
});

test('rejeita pagamento pendente', async () => {
  records.clear();
  await assert.rejects(recordPaidCheckout({ ...session(), payment_status: 'unpaid' }, stripe), /inválida|não paga/);
  assert.equal(records.size, 0);
});

test('rejeita total Stripe inconsistente', async () => {
  records.clear();
  await assert.rejects(recordPaidCheckout({ ...session(), amount_total: 19999 }, stripe), /diverge/);
  assert.equal(records.size, 0);
});

test('rejeita quantidades divergentes', async () => {
  records.clear();
  const altered = { checkout: { sessions: { listLineItems: async () => ({ has_more: false, data: [{
    quantity: 3, currency: 'brl', amount_total: 30000, price: { unit_amount: 10000 },
  }] }) } } };
  await assert.rejects(recordPaidCheckout(session(), altered), /inconsistente/);
  assert.equal(records.size, 0);
});
