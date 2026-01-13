# Back-end Node + Express (Login seguro pro Painel)

Este projeto cria um login **real** (validado no back-end) e protege rotas do painel com **cookie HttpOnly**.

## 1) Rodar localmente (opcional)
```bash
cd backend
npm install
npm run hash -- "SUA_SENHA_FORTE"
```

Crie um arquivo `.env` (copiando `.env.example`) e preencha:
- `ADMIN_USER`
- `ADMIN_PASS_HASH` (hash gerado)
- `JWT_SECRET` (um segredo grande)
- `FRONTEND_ORIGIN` (o domínio do seu site)

Depois:
```bash
npm start
```

Teste:
- `GET http://localhost:3000/health` -> ok
- `POST http://localhost:3000/auth/login`

## 2) Deploy no Render
1. Suba a pasta `backend` para um repo (ou copie para o repo atual).
2. No Render, crie um **Web Service** apontando para esse repo/pasta.
3. Build command: `npm install`
4. Start command: `npm start`
5. Em **Environment**, crie as variáveis do `.env.example`.

## 3) Front-end (login.html)
O `login.html` pronto está na raiz do ZIP.
Dentro dele você só precisa colocar a URL do seu back-end na constante `BACKEND_URL`.

## 4) Como proteger suas rotas
Use o middleware `requireAuth` (já está pronto) nas rotas que você NÃO quer que qualquer pessoa acesse:
- apagar produto
- editar produto
- mexer em estoque

Exemplo: `router.delete('/:id', requireAuth, ...)`
