'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

/**
 * Exemplo de rota protegida para "apagar" produto.
 * Aqui é só um stub (modelo). Você conecta com seu DB/arquivo/planilha depois.
 * DELETE /products/:id
 */
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  // TODO: aqui você chama sua lógica real:
  // - validar se existe
  // - remover ou marcar como inactive / stock=0
  // - salvar no banco/arquivo
  return res.json({ ok: true, deletedId: id });
});

module.exports = { productsRouter: router };
