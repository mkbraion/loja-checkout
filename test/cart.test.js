const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCart } = require('../src/cart');

test('aceita carrinho válido e soma itens repetidos', () => {
  assert.deepEqual([...normalizeCart([{ productId: 'a', quantity: 2 }, { productId: 'a', quantity: 3 }])], [['a', 5]]);
});

test('recusa carrinho vazio e formatos inválidos', () => {
  for (const items of [null, {}, [], [null], [{ productId: '', quantity: 1 }]]) assert.equal(normalizeCart(items), null);
});

test('recusa quantidades fracionárias, strings, negativas e acima de 99', () => {
  for (const quantity of [0, -1, 1.5, '2', NaN, Infinity, 100]) {
    assert.equal(normalizeCart([{ productId: 'a', quantity }]), null);
  }
});

test('recusa soma acima de 99 para produto repetido', () => {
  assert.equal(normalizeCart([{ productId: 'a', quantity: 90 }, { productId: 'a', quantity: 10 }]), null);
});
