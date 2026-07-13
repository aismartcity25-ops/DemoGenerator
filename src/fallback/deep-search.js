'use strict';

/**
 * fallback/deep-search.js — Fallback opzionale (live crawl) per query.
 *
 * Riutilizza deep-search-engine.js come modulo. Viene usato SOLO quando
 * il retrieve vettoriale (rag.js) non trova nulla, per URL ancora non
 * indicizzati o contenuti molto freschi.
 *
 * NOTA: deep-search-engine.js resta la fonte; qui lo esponiamo come
 * modulo pulito con un'unica export `searchConfiguredSites`.
 */

const { searchConfiguredSites } = require('./deep-search-engine');

module.exports = { searchConfiguredSites };
