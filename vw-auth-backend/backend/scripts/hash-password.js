// scripts/hash-password.js (ESM)
// Uso:
//   npm run hash -- "SUA_SENHA"
import bcrypt from "bcryptjs";

const password = process.argv.slice(2).join(" ").trim();

if (!password) {
  console.error('Uso: npm run hash -- "SUA_SENHA"');
  process.exit(1);
}

const saltRounds = 12;
const hash = await bcrypt.hash(password, saltRounds);
console.log(hash);
