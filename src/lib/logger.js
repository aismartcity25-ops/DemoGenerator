'use strict';

/**
 * logger.js — Log unificato (sostituisce i duplicati log/warn/err
 * sparsi in crawler.js, server.js, deep-search-engine.js).
 */

function ts() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(ts(), ...args);
}

function warn(...args) {
  console.warn(ts(), 'WARN', ...args);
}

function err(...args) {
  console.error(ts(), 'ERR', ...args);
}

module.exports = { log, warn, err, ts };
