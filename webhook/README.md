# PayPal → Atualizar estoque no GitHub (Node.js)

Este servidor **Node.js (Express)** recebe o **webhook do PayPal**, valida a assinatura e, quando o pagamento é confirmado (`PAYMENT.CAPTURE.COMPLETED`), ele **atualiza o `products.json` no GitHub** (remove o produto vendido ou reduz o estoque).

Ele foi preparado para o seu repositório:
- **STAVARENG0/vintage**

> ⚠️ Segurança: nunca cole seu **Secret** do PayPal ou seu **GitHub Token** em locais públicos. Se você já compartilhou seu Secret, gere outro no PayPal (rotate) e atualize no `.env`.

---

## O que você vai precisar
- Node.js 18+
- Um lugar para hospedar o Node (Render / Railway / VPS). **GitHub Pages não roda Node.**
- Seu **Client ID** e **Secret** do PayPal (Live ou Sandbox)
- Um **Webhook** criado no PayPal apontando para sua URL pública
- Um **GitHub Personal Access Token (PAT)** com permissão de escrita no repo

---

## Passo 1 — Instalar e rodar

```bash
cd paypal-stock-webhook
npm install
cp .env.example .env
# edite o .env
npm start
```

Teste rápido:
- `GET http://localhost:8080/health`

---

## Passo 2 — Configurar o `.env`
Abra o arquivo `.env` e preencha:

- `PAYPAL_MODE=live` (ou `sandbox` se estiver testando)
- `PAYPAL_CLIENT_ID=...`
- `PAYPAL_CLIENT_SECRET=...`
- `PAYPAL_WEBHOOK_ID=...`  ✅ **esse você copia depois de criar o webhook**

GitHub:
- `GITHUB_TOKEN=...` (PAT)
- `GITHUB_REPO=STAVARENG0/vintage`
- `GITHUB_BRANCH=main` (troque para `master` se seu repo usar master)
- `GITHUB_PRODUCTS_PATH=products.json` (troque se o arquivo estiver em outra pasta)

---

## Passo 3 — Criar o Webhook no PayPal (pegar o Webhook ID)

1. Abra **developer.paypal.com**
2. Clique em **Go to Dashboard**
3. Vá em **Apps & Credentials**
4. Selecione o ambiente correto no topo:
   - **Live** (venda real) ou **Sandbox** (teste)
5. Em **REST API apps**, clique no seu app
6. Role até a seção **Webhooks** e clique **Add Webhook**
7. Cole a URL do seu servidor Node:
   - `https://SEU-DOMINIO.com/webhooks/paypal`
8. Marque o evento:
   - ✅ `PAYMENT.CAPTURE.COMPLETED`
9. Salve
10. Clique no webhook criado e copie o **Webhook ID** → cole no `.env` em `PAYPAL_WEBHOOK_ID`

---

## Passo 4 — Atualizar seu checkout para mandar o ID do produto (SKU)

Para o servidor saber qual produto foi pago, o pedido do PayPal precisa levar o **id do produto** como `sku`.

Dentro do seu `createOrder`, ajuste o `items` assim:

```js
const items = cart.map(item => ({
  name: item.title,
  sku: String(item.id),
  unit_amount: { currency_code: 'EUR', value: item.price.toFixed(2) },
  quantity: item.qty.toString(),
  category: 'PHYSICAL_GOODS'
}));
```

Já deixei um arquivo pronto para você usar:
- `frontend/checkout_with_sku.html` (substitua o seu `checkout.html` por ele)

---

## Como o estoque é atualizado
- Se `REMOVE_ON_SALE=true`: quando o estoque chega a 0, o produto é **removido** do `products.json` (ideal para peça única).
- Se `REMOVE_ON_SALE=false`: o produto fica e o estoque vai para 0.

---

## Rotas do servidor
- `POST /webhooks/paypal` → endpoint do PayPal
- `GET /health` → checar se o servidor está ok

---

## Solução rápida de problemas
- Webhook não chega:
  - a URL precisa ser **HTTPS** e pública
  - o webhook deve estar no **mesmo ambiente** (Live/Sandbox) do seu pagamento
- Assinatura falha:
  - `PAYPAL_WEBHOOK_ID` errado (copie do webhook certo)
- Não atualiza o GitHub:
  - confirme `GITHUB_BRANCH` e `GITHUB_PRODUCTS_PATH`
  - confirme se o PAT tem permissão de escrita
