# Vintage Auth Server (Render + Railway MySQL + Resend + Twilio)

Este projeto fornece:
- Cadastro via **email ou telefone** com **código de verificação (OTP)**  
  ✅ **O usuário só é criado na tabela `users` depois de confirmar o código.**
- Login via email/telefone + senha
- **Esqueci minha senha** via OTP por email ou SMS
- Endpoint `/health` para Render

## 1) Banco de dados (Railway MySQL)
Rode o SQL em `sql/schema.sql` no seu MySQL Railway.

## 2) Variáveis de ambiente (Render)
Configure as variáveis do `.env.example` no Render (Environment).

## 3) Deploy no Render
- Root directory: este projeto
- Build command: (vazio)
- Start command: `npm start`

## 4) Endpoints principais

### Cadastro
- `POST /auth/register/email` { name, email, password }
- `POST /auth/register/phone` { name, phone, password }
Envia OTP e salva **apenas** um registro pendente em `auth_otps` (purpose=register).

### Confirmar cadastro
- `POST /auth/verify/email` { email, code }
- `POST /auth/verify/phone` { phone, code }
Cria o usuário em `users` e retorna `{ token }`.

### Login
- `POST /auth/login` { email, password }
- `POST /auth/login/phone` { phone, password }
Retorna `{ token }`.

### Esqueci minha senha
- `POST /auth/password/reset/start` { contact } (contact pode ser email ou phone)
- `POST /auth/password/reset/finish` { contact, code, newPassword }
Atualiza a senha e retorna `{ ok: true }`.

## Observações de segurança
- OTP expira em 10 minutos
- Limite de tentativas por OTP (5)
- Senhas são hash com bcrypt

