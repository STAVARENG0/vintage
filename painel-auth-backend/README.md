# painel-auth-backend

Backend simples para **login do painel do cliente** usando **MySQL + JWT**.

Ele foi pensado para funcionar junto do seu serviço atual de cadastro/OTP/Google:
- Você pode **apontar este backend para o MESMO banco MySQL** onde seu serviço de cadastro já cria os usuários.
- O painel só precisa de: **login → token → endpoint `/me`**.

## O que ele entrega
- `POST /auth/login/password` (email + senha)
- `POST /auth/login/otp/request` (manda código SMS via Twilio)
- `POST /auth/login/otp/verify` (verifica código e retorna token)
- `POST /auth/login/google` (recebe Google ID token e retorna token)
- `GET /me` (privado; valida token)
- `GET /health` (verifica conexão com banco)

## 1) Variáveis de ambiente
Copie `.env.example` para `.env` e preencha.

Obrigatórias:
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
- `JWT_SECRET`
- `CORS_ORIGINS` (seu domínio do front)

Opcional:
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- Google: `GOOGLE_CLIENT_ID`

## 2) Banco / Migração
Se você **já tem** a tabela `users` no seu serviço atual, ajuste o schema conforme seu DB e ignore a migração.

Se você vai começar do zero:

```bash
npm install
npm run migrate
```

O schema está em `sql/schema.sql`.

## 3) Rodar local
```bash
npm install
npm run dev
```

Teste:
- `GET http://localhost:3000/health`

## 4) Deploy (Render / Railway)
### Render (Web Service)
- Build: `npm install`
- Start: `npm start`
- Sete as env vars.

## 5) Como o painel valida login
No front-end:
1) Faz login e recebe `{ token }`
2) Salva em `localStorage` (ex.: `vw_token`)
3) Abre o painel e chama `GET /me` com:

```
Authorization: Bearer <token>
```

Se `GET /me` retornar 200, está logado.
Se retornar 401, apaga o token e volta pro login.

## Exemplos (curl)
### Login com senha
```bash
curl -X POST http://localhost:3000/auth/login/password \
  -H "Content-Type: application/json" \
  -d '{"email":"a@a.com","password":"123456"}'
```

### OTP request
```bash
curl -X POST http://localhost:3000/auth/login/otp/request \
  -H "Content-Type: application/json" \
  -d '{"phone":"+3538..."}'
```

### OTP verify
```bash
curl -X POST http://localhost:3000/auth/login/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"+3538...","code":"123456"}'
```

### /me
```bash
curl http://localhost:3000/me \
  -H "Authorization: Bearer SEU_TOKEN"
```
