const fs = require("fs");
const path = require("path");

function ensureUploadDir(){
  const dir = process.env.UPLOAD_DIR || "uploads";
  const abs = path.join(process.cwd(), dir);
  if(!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
  return abs;
}

function publicUrlFor(relPath){
  const base = process.env.PUBLIC_BASE_URL || "";
  // relPath like "uploads/avatars/.."
  return base.replace(/\/$/, "") + "/" + relPath.replace(/^\//, "");
}

module.exports = { ensureUploadDir, publicUrlFor };
