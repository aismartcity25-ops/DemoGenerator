'use strict';

/**
 * router-agent.js — Decide quali tool sono disponibili per il turno.
 *
 * Euristico (nessuna chiamata LLM): oggi la decisione e' un semplice
 * booleano su demo.knowledgeBaseId (escludi search_websites quando esiste
 * una knowledge base configurata), quindi non c'e' ambiguita' da risolvere
 * con un modello. L'interfaccia resta pronta per un fallback LLM futuro
 * (gpt-4o-mini) se emergesse un vero caso di intent-detection ambiguo.
 */

const { getToolsForDemo } = require('../lib/tools');

function createRouterAgent() {
  function route({ demo } = {}) {
    const tools = getToolsForDemo(!!(demo && demo.knowledgeBaseId));
    return { tools };
  }

  return { route };
}

module.exports = { createRouterAgent };
