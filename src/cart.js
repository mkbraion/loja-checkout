'use strict';

// Normaliza um carrinho sem confiar em quantidades enviadas pelo cliente.
function normalizeCart(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const wanted = new Map();
  for (const item of items) {
    if (!item || typeof item.productId !== 'string' || !item.productId.trim()) return null;
    const qty = item.quantity;
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 99) return null;
    const next = (wanted.get(item.productId) || 0) + qty;
    if (next > 99) return null;
    wanted.set(item.productId, next);
  }
  return wanted;
}

module.exports = { normalizeCart };
