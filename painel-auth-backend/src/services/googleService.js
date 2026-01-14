import { OAuth2Client } from 'google-auth-library';

let _client = null;

function getClient() {
  if (_client) return _client;
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (!cid) return null;
  _client = new OAuth2Client(cid);
  return _client;
}

export async function verifyGoogleIdToken(idToken) {
  const client = getClient();
  if (!client) throw new Error('GOOGLE_CLIENT_ID não configurado');

  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub) throw new Error('Token Google inválido');

  return {
    sub: payload.sub,
    email: payload.email || null,
    name: payload.name || payload.given_name || 'Cliente'
  };
}
