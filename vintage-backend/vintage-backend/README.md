# Vintage Backend (Node + Express + MySQL)

Este backend foi feito para funcionar com o seu front-end (login/painel/carrinho/checkout) e **salvar tudo no MySQL (Railway)**.

✅ JWT (token `vw_token`)  
✅ Login por email **ou** telefone  
✅ Cadastro + verificação por código (modo dev devolve o código na resposta)  
✅ Google OAuth (gera JWT e entrega via `/auth/callback`)  
✅ Perfil (`/user/me`), settings (`/user/settings`)  
✅ Upload de avatar (`/user/avatar`)  
✅ Carrinho do usuário (`/cart/*`) + sync do localStorage (`/cart/sync`)  
✅ Roleta/bônus (`/bonus/spin`) e aplicação no checkout (`/checkout/summary`)

---

## 1) Rodar local

```bash
npm i
cp .env.example .env
npm run migrate
npm run dev
```

API: `http://localhost:8080`

---

## 2) Variáveis (Render)

Crie as variáveis do `.env.example` no Render (Environment).  
Para MySQL do Railway, use `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`.

---

## 3) Banco (Railway / MySQL)

- Crie um projeto MySQL no Railway
- Copie host/porta/user/password/database
- Rode `npm run migrate`

---

## 4) Front-end

No seu `cliente-login-2.html`, o front usa:
- `TOKEN_KEY = "vw_token"`
- `API_BASE = "https://SEU_BACKEND.onrender.com"`
- redirect para `painel.html`

Este backend segue exatamente esse padrão (token `vw_token`).

---

## 5) Produção: upload de avatar

Este projeto salva arquivos em `uploads/`.  
No Render, o filesystem é efêmero **a menos que você configure um Persistent Disk**.
Alternativas:
- Render Persistent Disk (mais simples)
- S3/Cloudinary (melhor para produção)

---

## Endpoints principais

### Auth
- `POST /auth/login` { email, password }
- `POST /auth/login/phone` { phone, password }
- `POST /auth/register/email` { email, password, name }
- `POST /auth/register/phone` { phone, password, name }
- `POST /auth/verify/email` { email, code }
- `POST /auth/verify/phone` { phone, code }
- `POST /auth/password/reset/start` { contact }
- `POST /auth/password/reset/finish` { contact, code, newPassword }
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /auth/callback?token=...` (HTML que salva `vw_token` no localStorage e redireciona)

### User
- `GET /user/me`
- `GET /user/settings`
- `PUT /user/settings`
- `POST /user/avatar` (multipart/form-data: avatar)

### Cart
- `GET /cart`
- `POST /cart/sync` { items: [...] }
- `POST /cart/items` (add/update)
- `DELETE /cart/items/:id` (remove)

### Bonus / Wheel
- `POST /bonus/spin`
- `GET /bonus/balance`
- `POST /bonus/apply` { bonusId } (opcional – checkout aplica automaticamente o melhor bônus)

### Checkout
- `GET /checkout/summary`

---

## Licença
MIT
