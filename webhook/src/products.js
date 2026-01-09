import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// ⚠️ ATENÇÃO: É ZERO (0), NÃO LETRA O
const OWNER = "STAVARENG0";
const REPO = "vintage";
const PRODUCTS_PATH = "products.json";


/**
 * Remove produtos do products.json pelo ID
 * @param {string[]} ids
 */
export async function removeProductsById(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) {
    console.log("⚠️ Nenhum ID recebido para remoção");
    return;
  }

  try {
    // 1️⃣ Buscar o arquivo no GitHub
    const file = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: PRODUCTS_PATH,
    });

    const content = Buffer
      .from(file.data.content, "base64")
      .toString("utf8");

    const products = JSON.parse(content);

    console.log("📦 IDs no JSON:", products.map(p => p.id));
    console.log("🧾 IDs pagos:", ids);

    // 2️⃣ Remover produtos pagos
    const updatedProducts = products.filter(
      p => !ids.includes(p.id)
    );

    // 3️⃣ Segurança: se nada mudou, não commita
    if (updatedProducts.length === products.length) {
      console.error("❌ Nenhum produto removido. ID não encontrado.");
      return;
    }

    // 4️⃣ Commit no GitHub
    await octokit.repos.createOrUpdateFileContents({
      owner: OWNER,
      repo: REPO,
      path: PRODUCTS_PATH,
      message: `Remove product after payment (${ids.join(", ")})`,
      content: Buffer
        .from(JSON.stringify(updatedProducts, null, 2))
        .toString("base64"),
      sha: file.data.sha,
    });

    console.log("✅ Produto removido e commitado com sucesso:", ids);

  } catch (err) {
    console.error("🔥 Erro ao remover produto:", err);
  }
}
