'use strict';

/**
 * query.js — Analisi/normalizzazione query condivisa.
 *
 * analyzeQuery / tokenize erano in deep-search-engine.js e (in forma
 * morta) in enhanced-chat-service.js. Ora unica fonte, riusabile dal
 * retrieve e dal routing.
 */

function tokenize(query) {
  return query
    .toLowerCase()
    .replace(/[^\w\sàèéìíîòóùú]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

/**
 * Stima complessità/strategia della query (adattivo).
 * Ritorna { complexity, strategy, hasContactInfo, hasServiceName,
 *           hasSpecificInfo, isSimpleQuestion, estimatedTime, tokens }.
 */
async function analyzeQuery(query) {
  const startTime = Date.now();
  const tokens = tokenize(query);
  const hasContactInfo = tokens.some(t => ['telefono', 'email', 'indirizzo', 'orari', 'orario'].includes(t));
  const hasServiceName = tokens.some(t => ['servizio', 'prenotazione', 'appuntamento', 'documenti'].includes(t));
  const hasSpecificInfo = tokens.some(t => ['costo', 'prezzo', 'validità', 'scadenza', 'requisiti'].includes(t));
  const isSimpleQuestion = query.length < 50;
  const complexityScore = (hasContactInfo ? 1 : 0) + (hasServiceName ? 1 : 0) + (hasSpecificInfo ? 1 : 0) + (isSimpleQuestion ? 0 : 1);
  const estimatedTime = Math.min(5000 + complexityScore * 3000, 15000);

  return {
    complexity: complexityScore,
    strategy: complexityScore <= 1 ? 'targeted' : complexityScore <= 2 ? 'adaptive' : 'comprehensive',
    hasContactInfo,
    hasServiceName,
    hasSpecificInfo,
    isSimpleQuestion,
    estimatedTime,
    tokens,
    timeElapsed: Date.now() - startTime
  };
}

module.exports = { tokenize, analyzeQuery };
