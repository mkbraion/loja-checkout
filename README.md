# Loja Virtual · login seguro e checkout

Loja virtual completa (full-stack) com **cadastro/login seguro** e **checkout**. Diferente dos sites institucionais, este é um app de verdade: tem servidor, banco de dados e autenticação.

Stack: **Node + Express + Prisma (SQLite) + JWT**. Frontend em HTML/CSS/JS puro.

## O que tem

- Catálogo de produtos vindo do banco
- Carrinho de compras
- **Cadastro e login** com senha protegida
- **Checkout** que gera o pedido e o vincula ao usuário
- Tela de "Meus pedidos"

## Segurança levada a sério

Foi o ponto central deste projeto:

- **Senhas com hash bcrypt** (cost 12) — a senha em texto puro nunca é salva nem trafega de volta.
- **Login por JWT**, com segredo em variável de ambiente e expiração.
- **Preço calculado no servidor.** O carrinho manda só o produto e a quantidade; o valor é somado a partir do preço do **banco**, então ninguém consegue alterar o preço pelo navegador. Este é o erro clássico de loja mal feita — aqui está fechado.
- **Rate limit** nas rotas de conta (freia ataque de força-bruta no login).
- **Mensagens de erro genéricas** no login ("e-mail ou senha incorretos") — não revela se o e-mail existe.
- **Validação de entrada** (e-mail, tamanho de senha, quantidades).
- **Helmet** aplica cabeçalhos de segurança + CSP; o front não usa nada inline (sem `onclick`/`<script>` embutido).
- **Prisma** usa consultas parametrizadas — sem injeção de SQL.
- **Segredos fora do Git**: `.env` está no `.gitignore`; há um `.env.example` de referência.

## Como rodar

```bash
git clone https://github.com/mkbraion/loja-checkout
cd loja-checkout
npm install
cp .env.example .env          # no Windows: copy .env.example .env
# edite o .env e gere um JWT_SECRET forte:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm run setup                 # cria o banco e popula os produtos
npm start                     # http://localhost:4000
```

## Pagamento real (Stripe)

O checkout já separa a etapa de pagamento na função `processPayment()` em [`src/routes/orders.js`](src/routes/orders.js), hoje simulada como aprovada. Para cobrar de verdade:

1. Crie uma conta no [Stripe](https://stripe.com) e pegue as chaves de **teste**.
2. `npm install stripe` e use a chave secreta a partir do `.env` (`STRIPE_SECRET_KEY`).
3. Em `processPayment()`, crie um **PaymentIntent** e confirme o pagamento com o token do cartão vindo do front (Stripe Elements). Só marque o pedido como `pago` quando o Stripe confirmar.

> Enquanto estiver em modo teste, use os cartões de teste do Stripe (ex.: `4242 4242 4242 4242`).

## Deploy (grátis, 1 clique)

Por ter servidor, **não roda no GitHub Pages** — precisa de um host de Node. O repositório já vem com um [`render.yaml`](render.yaml), então dá pra subir no [Render](https://render.com) (plano gratuito, sem cartão) em poucos cliques:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/mkbraion/loja-checkout)

1. Clique no botão acima e entre no Render com sua conta do GitHub.
2. O Render lê o `render.yaml`, gera o `JWT_SECRET` sozinho e clica em **Apply**.
3. Em 2–3 minutos sai uma URL tipo `https://loja-checkout.onrender.com`.

> No plano gratuito o serviço "dorme" após um tempo parado (a primeira visita depois disso demora ~50s) e o banco SQLite é reiniciado. Perfeito para demonstração. Para dados permanentes, troque para **Postgres** (o `render.yaml` pode provisionar um) e ajuste o `provider` no `schema.prisma`.

---

Feito por [@mkbraion](https://github.com/mkbraion).
