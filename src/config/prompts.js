'use strict';

/**
 * prompts.js — Selettore centrale dei system prompt in base al "lato" della demo.
 *
 * - lato "medicai"  -> src/config/prompts_medicai.js
 * - lato "comunicai" -> src/config/prompts_comunicai.js
 *
 * Il lato è determinato dal campo `demo.product` (valorizzato in
 * orchestrator.js da demo.product || product, default "comunicai").
 */

const { buildSystemPrompt: buildMedicai } = require('./prompts_medicai.js');
const { buildSystemPrompt: buildComunicai } = require('./prompts_comunicai.js');

function buildSystemPrompt(product, customInstructions) {
  const side = String(product || 'comunicai').toLowerCase();

  if (side === 'medicai') {
    return buildMedicai(product, customInstructions);
  }

  return buildComunicai(product, customInstructions);
}

module.exports = { buildSystemPrompt };
