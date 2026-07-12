'use strict';

// ---------- Estado ----------
const API = ''; // mesma origem
let TOKEN = localStorage.getItem('us_token') || null;
let USER = JSON.parse(localStorage.getItem('us_user') || 'null');
let CART = JSON.parse(localStorage.getItem('us_cart') || '{}'); // { productId: qty }
let PRODUCTS = [];
let PRODUCTS_BY_ID = {};
let authMode = 'login';
let pendingCheckout = false;
let STRIPE_ENABLED = false;

// ---------- Utilidades ----------
const $ = (id) => document.getElementById(id);
const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'hidden') node.hidden = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

let toastTimer;
function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
  return data;
}

function persistCart() { localStorage.setItem('us_cart', JSON.stringify(CART)); }

// ---------- Produtos ----------
async function loadProducts() {
  const { products } = await api('/api/products');
  PRODUCTS = products;
  PRODUCTS_BY_ID = Object.fromEntries(products.map((p) => [p.id, p]));
  renderFilters();
  renderProducts();
}

let activeCat = 'Todos';
function renderFilters() {
  const cats = ['Todos', ...new Set(PRODUCTS.map((p) => p.category))];
  const box = $('filters');
  box.textContent = '';
  cats.forEach((c) => {
    box.append(el('button', {
      class: 'chip' + (c === activeCat ? ' active' : ''),
      text: c,
      onclick: () => { activeCat = c; renderFilters(); renderProducts(); },
    }));
  });
}

function renderProducts() {
  const grid = $('grid');
  grid.textContent = '';
  PRODUCTS.filter((p) => activeCat === 'Todos' || p.category === activeCat).forEach((p) => {
    grid.append(
      el('div', { class: 'prod' },
        el('div', { class: 'img', text: p.emoji }),
        el('div', { class: 'info' },
          el('span', { class: 'cat', text: p.category }),
          el('h3', { text: p.name }),
          el('p', { class: 'desc', text: p.description }),
          el('div', { class: 'bottom' },
            el('span', { class: 'price', text: brl(p.price) }),
            el('button', { class: 'add', text: 'Adicionar', onclick: () => addToCart(p.id) }),
          ),
        ),
      )
    );
  });
}

// ---------- Carrinho ----------
function addToCart(id) {
  CART[id] = (CART[id] || 0) + 1;
  persistCart();
  updateCartCount();
  toast('Adicionado ao carrinho');
}
function changeQty(id, delta) {
  CART[id] = (CART[id] || 0) + delta;
  if (CART[id] <= 0) delete CART[id];
  persistCart();
  updateCartCount();
  renderCart();
}
function cartEntries() {
  return Object.entries(CART)
    .map(([id, qty]) => ({ product: PRODUCTS_BY_ID[id], qty }))
    .filter((e) => e.product);
}
function cartTotalCents() {
  return cartEntries().reduce((s, e) => s + e.product.price * e.qty, 0);
}
function updateCartCount() {
  const n = Object.values(CART).reduce((s, q) => s + q, 0);
  $('cartCount').textContent = n;
}
function renderCart() {
  const body = $('cartItems');
  body.textContent = '';
  const entries = cartEntries();
  if (entries.length === 0) {
    body.append(el('p', { class: 'empty', text: 'Seu carrinho está vazio.' }));
  } else {
    entries.forEach(({ product, qty }) => {
      body.append(
        el('div', { class: 'cart-item' },
          el('span', { class: 'ci-emoji', text: product.emoji }),
          el('div', { class: 'ci-info' },
            el('b', { text: product.name }),
            el('span', { text: brl(product.price) }),
          ),
          el('div', { class: 'qty' },
            el('button', { text: '−', onclick: () => changeQty(product.id, -1) }),
            el('span', { text: String(qty) }),
            el('button', { text: '+', onclick: () => changeQty(product.id, +1) }),
          ),
        )
      );
    });
  }
  $('cartTotal').textContent = brl(cartTotalCents());
}

// ---------- Sessão / Auth ----------
function updateAuthUI() {
  const logged = !!TOKEN;
  $('loginBtn').hidden = logged;
  $('logoutBtn').hidden = !logged;
  $('ordersBtn').hidden = !logged;
  const hello = $('hello');
  hello.hidden = !logged;
  if (logged && USER) hello.textContent = 'Olá, ' + USER.name.split(' ')[0];
}
function setSession(token, user) {
  TOKEN = token; USER = user;
  localStorage.setItem('us_token', token);
  localStorage.setItem('us_user', JSON.stringify(user));
  updateAuthUI();
}
function logout() {
  TOKEN = null; USER = null;
  localStorage.removeItem('us_token');
  localStorage.removeItem('us_user');
  updateAuthUI();
  toast('Você saiu da conta.');
}
function openAuth(mode) {
  authMode = mode || 'login';
  $('tabLogin').classList.toggle('active', authMode === 'login');
  $('tabRegister').classList.toggle('active', authMode === 'register');
  $('nameField').hidden = authMode !== 'register';
  $('f-name').required = authMode === 'register';
  $('authSubmit').textContent = authMode === 'register' ? 'Criar conta' : 'Entrar';
  $('f-password').autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
  $('authError').hidden = true;
  $('authOverlay').hidden = false;
}
function closeAuth() { $('authOverlay').hidden = true; pendingCheckout = false; }

async function submitAuth(e) {
  e.preventDefault();
  const btn = $('authSubmit');
  const errBox = $('authError');
  errBox.hidden = true;
  const body = {
    email: $('f-email').value.trim(),
    password: $('f-password').value,
  };
  if (authMode === 'register') body.name = $('f-name').value.trim();
  btn.disabled = true;
  try {
    const path = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const data = await api(path, { method: 'POST', body: JSON.stringify(body) });
    setSession(data.token, data.user);
    $('authOverlay').hidden = true;
    $('authForm').reset();
    toast('Bem-vindo(a), ' + data.user.name.split(' ')[0] + '!');
    if (pendingCheckout) { pendingCheckout = false; checkout(); }
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

// ---------- Checkout ----------
async function checkout() {
  const entries = cartEntries();
  if (entries.length === 0) { toast('Seu carrinho está vazio.', true); return; }
  if (!TOKEN) {
    pendingCheckout = true;
    toast('Faça login para finalizar a compra.');
    openAuth('login');
    return;
  }
  const btn = $('checkoutBtn');
  btn.disabled = true;
  btn.textContent = 'Processando...';
  try {
    const items = entries.map((e) => ({ productId: e.product.id, quantity: e.qty }));
    if (STRIPE_ENABLED) {
      // Paga no Stripe: cria a sessão e redireciona. O pedido só é criado
      // depois que o Stripe confirmar o pagamento (ver /api/checkout/confirm).
      const { url } = await api('/api/checkout', { method: 'POST', body: JSON.stringify({ items }) });
      window.location.href = url;
      return;
    }
    const { order } = await api('/api/orders', { method: 'POST', body: JSON.stringify({ items }) });
    CART = {}; persistCart(); updateCartCount(); renderCart();
    $('cart').hidden = true; $('cartOverlay').hidden = true;
    toast('✅ Pedido confirmado! Total ' + brl(order.total));
    openOrders();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Pagar e finalizar';
  }
}

// ---------- Pedidos ----------
async function openOrders() {
  $('ordersOverlay').hidden = false;
  const list = $('ordersList');
  list.textContent = '';
  list.append(el('p', { class: 'empty', text: 'Carregando...' }));
  try {
    const { orders } = await api('/api/orders');
    list.textContent = '';
    if (!orders.length) { list.append(el('p', { class: 'empty', text: 'Você ainda não fez pedidos.' })); return; }
    orders.forEach((o) => {
      const card = el('div', { class: 'order' },
        el('div', { class: 'order-head' },
          el('span', { text: new Date(o.createdAt).toLocaleString('pt-BR') }),
          el('span', { class: 'paid', text: o.status.toUpperCase() }),
        ),
      );
      o.items.forEach((it) => {
        card.append(el('div', { class: 'order-item' },
          el('span', { text: it.quantity + '× ' + it.name }),
          el('span', { text: brl(it.price * it.quantity) }),
        ));
      });
      card.append(el('div', { class: 'order-total' },
        el('span', { text: 'Total' }),
        el('span', { text: brl(o.total) }),
      ));
      list.append(card);
    });
  } catch (err) {
    list.textContent = '';
    list.append(el('p', { class: 'empty', text: err.message }));
  }
}

// ---------- Ligações de UI ----------
function openCart() { renderCart(); $('cart').hidden = false; $('cartOverlay').hidden = false; }
function closeCart() { $('cart').hidden = true; $('cartOverlay').hidden = true; }

$('cartBtn').addEventListener('click', openCart);
$('cartClose').addEventListener('click', closeCart);
$('cartOverlay').addEventListener('click', closeCart);
$('checkoutBtn').addEventListener('click', checkout);
$('loginBtn').addEventListener('click', () => openAuth('login'));
$('logoutBtn').addEventListener('click', logout);
$('ordersBtn').addEventListener('click', openOrders);
$('tabLogin').addEventListener('click', () => openAuth('login'));
$('tabRegister').addEventListener('click', () => openAuth('register'));
$('authClose').addEventListener('click', closeAuth);
$('authOverlay').addEventListener('click', (e) => { if (e.target === $('authOverlay')) closeAuth(); });
$('authForm').addEventListener('submit', submitAuth);
$('ordersClose').addEventListener('click', () => { $('ordersOverlay').hidden = true; });
$('ordersOverlay').addEventListener('click', (e) => { if (e.target === $('ordersOverlay')) $('ordersOverlay').hidden = true; });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeCart(); closeAuth(); $('ordersOverlay').hidden = true; }
});

// ---------- Início ----------
async function loadConfig() {
  try { STRIPE_ENABLED = (await api('/api/config')).stripeEnabled; } catch { STRIPE_ENABLED = false; }
}

// Trata o retorno do Stripe (?pagamento=ok|cancelado|falhou|erro).
function handleReturn() {
  const status = new URLSearchParams(location.search).get('pagamento');
  if (!status) return;
  if (status === 'ok') {
    CART = {}; persistCart(); updateCartCount();
    toast('✅ Pagamento aprovado! Pedido confirmado.');
    if (TOKEN) openOrders();
  } else if (status === 'cancelado') {
    toast('Pagamento cancelado.', true);
  } else {
    toast('Não foi possível confirmar o pagamento.', true);
  }
  history.replaceState({}, '', location.pathname);
}

updateAuthUI();
updateCartCount();
loadConfig();
handleReturn();
loadProducts().catch((err) => toast(err.message, true));
