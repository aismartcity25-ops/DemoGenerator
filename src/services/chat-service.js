'use strict';

/**
 * chat-service.js — Adapter HTTP sottile per la chat (server.js + widget).
 *
 * REFACTOR (architettura a micro-agent):
 *   - la logica di orchestrazione (Router, Memory, Query Planner, RAG,
 *     Database, Tool Executor, Guardrail, Copywriter, QA) vive ora in
 *     src/orchestrator.js + src/agents/*.
 *   - questo file resta solo un adapter con la stessa firma di sempre,
 *     cosi' server.js non richiede alcuna modifica.
 */

const { textToSpeech } = require('../lib/tts');
const { orchestrateChat, clearChatSession } = require('../orchestrator');

async function handleChat(req, res, openai, { rag } = {}) {
  return orchestrateChat(req, res, openai, { rag });
}

module.exports = { handleChat, clearChatSession, textToSpeech };
