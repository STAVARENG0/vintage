'use strict';

const bcrypt = require('bcryptjs');

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.log('Uso: npm run hash -- "SUA_SENHA_AQUI"');
    process.exit(1);
  }
  const saltRounds = 12;
  const hash = await bcrypt.hash(password, saltRounds);
  console.log('\n✅ Cole este valor em ADMIN_PASS_HASH no Render (.env):\n');
  console.log(hash);
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
