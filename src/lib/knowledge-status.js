'use strict';

/**
 * lib/knowledge-status.js — Derives a demo's knowledge-base status
 * directly from the knowledge engine, on every call. No caching, no
 * background poller, no field persisted in demos.json to go stale or
 * race with itself — the engine's job store is already the durable,
 * authoritative record (survives restarts on its own), so this is just
 * a read plus a small translation into vocabulary the UI understands.
 *
 * `phase` values: legacy | pending | crawling | embedding | indexing |
 * ready | empty | failed.
 *   - legacy: demo has no knowledge base (created without seed URLs).
 *   - empty: the crawl finished without error but indexed zero chunks
 *     (e.g. the seed was unreachable/rate-limited on every retry, or the
 *     only reachable pages had no extractable content) — distinct from
 *     "ready" so callers never mistake an empty knowledge base for a
 *     working one.
 */

const engine = require('../knowledge-engine');

function deriveKnowledgeStatus(kbId) {
  if (!kbId) {
    return { phase: 'legacy', ready: false, empty: false, error: null, stats: null };
  }

  const job = engine.getJobStatus(kbId);
  if (!job) {
    return { phase: 'pending', ready: false, empty: false, error: null, stats: null };
  }

  const chunksIndexed = (job.stats && job.stats.chunksIndexed) || 0;
  let phase;
  if (job.status === 'queued') {
    phase = 'pending';
  } else if (job.status === 'running') {
    const s = job.stats;
    if (!s) phase = 'running';
    else if (!s.crawlComplete) phase = 'crawling';
    else if (s.pagesPendingIngest > 0) phase = 'embedding';
    else phase = 'indexing';
  } else if (job.status === 'completed') {
    phase = chunksIndexed > 0 ? 'ready' : 'empty';
  } else {
    // failed | cancelled
    phase = 'failed';
  }

  let error = job.error || null;
  if (!error && phase === 'empty') {
    const s = job.stats || {};
    error = (s.fetchedUrls || 0) === 0
      ? `Nessuna pagina raggiungibile (${s.failedUrls || 0} fallite).`
      : `${s.fetchedUrls || 0} pagine crawlate ma nessun contenuto indicizzabile.`;
  }

  return {
    phase,
    ready: phase === 'ready',
    empty: phase === 'empty',
    error,
    stats: job.stats
  };
}

module.exports = { deriveKnowledgeStatus };
