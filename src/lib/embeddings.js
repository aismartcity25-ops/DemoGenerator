'use strict';

/**
 * embeddings.js — Embedding OpenAI condiviso: LRU cache + throttle globale.
 *
 * Unifica la logica duplicata in rag.js (embed + embeddingCache LRU) e
 * ingest.js (embedBatch + THROTTLE). Un solo client, una sola cache,
 * un solo rate-limiter condiviso da ingest (offline) e rag (online).
 */

const crypto = require('crypto');

function createEmbedder({
  openai,
  model = 'text-embedding-3-small',
  cacheSize = 500,
  maxRetries = 5,
  retryBaseMs = 1500,
  minBatchIntervalMs = 1200,
  burstCooldownMs = 8000
} = {}) {
  if (!openai) throw new Error('createEmbedder: openai client richiesto');

  const cache = new Map(); // LRU

  const throttle = { lastCall: 0, consecutive429: 0 };

  function cacheGet(key) {
    if (!cache.has(key)) return null;
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value); // LRU touch
    return value;
  }

  function cacheSet(key, value) {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, value);
    while (cache.size > cacheSize) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function throttleWait() {
    const diff = Date.now() - throttle.lastCall;
    if (diff < minBatchIntervalMs) {
      await sleep(minBatchIntervalMs - diff);
    }
    throttle.lastCall = Date.now();
  }

  /** Embed di un singolo testo (con cache LRU). */
  async function embed(text) {
    const cached = cacheGet(text);
    if (cached) return cached;

    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await openai.embeddings.create({ model, input: text });
        const vector = res.data[0].embedding;
        cacheSet(text, vector);
        return vector;
      } catch (err) {
        lastError = err;
        const retryAfter =
          Number(err?.headers?.['retry-after-ms']) ||
          Number(err?.headers?.['retry-after']) * 1000 ||
          retryBaseMs * attempt;
        console.log(`Embedding retry ${attempt}/${maxRetries}`);
        await sleep(retryAfter);
      }
    }
    throw lastError;
  }

  /**
   * Embed di un batch (usato da ingest). Rispetta il throttle globale e fa
   * cache per singolo elemento. Ritorna array di vettori.
   */
  async function embedBatch(items) {
    const vectors = [];
    for (let i = 0; i < items.length; i++) {
      const text = items[i].text;
      const cached = cacheGet(text);
      if (cached) {
        vectors.push(cached);
        continue;
      }

      let lastError;
      let ok = false;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await throttleWait();
          const res = await openai.embeddings.create({
            model,
            input: items.slice(i).map(x => x.text)
          });
          // Salviamo tutti i vettori restituiti dal batch a partire da i
          for (let j = 0; j < res.data.length; j++) {
            const v = res.data[j].embedding;
            cacheSet(items[i + j].text, v);
            if (j === 0) vectors.push(v);
          }
          ok = true;
          break;
        } catch (err) {
          lastError = err;
          const base = retryBaseMs * attempt;
          const penalty = throttle.consecutive429 > 2 ? burstCooldownMs : 0;
          console.log(`⚠ retry ${attempt}/${maxRetries} (wait ${base + penalty}ms)`);
          await sleep(base + penalty);
        }
      }
      if (!ok) throw lastError;
    }
    return vectors;
  }

  function fingerprint(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  return { embed, embedBatch, cacheGet, cacheSet, fingerprint };
}

module.exports = { createEmbedder };
