'use strict';

/**
 * tool-executor-agent.js — Dispatch/esecuzione dei tool richiesti dal
 * Copywriter (function-calling).
 *
 * Estratto dallo switch-case prima inline in chat-service.js#handleChat.
 * Differenza chiave rispetto all'originale: le tool_calls di un turno
 * vengono eseguite in Promise.all invece che in un `for` sequenziale — sono
 * gia' indipendenti tra loro (abbinate per tool_call_id), quindi eseguirle
 * in parallelo riduce la latenza totale a ~max() invece di sum() quando il
 * modello richiede piu' tool nello stesso turno (es. search_configured_sites
 * + search_websites).
 *
 * Ogni handler ritorna { content, meta? } invece di mutare un oggetto
 * `capture` esterno passato per riferimento (pattern originale in
 * chat-service.js): l'aggregazione finale (citations/confidence/attachment)
 * avviene qui, alla fine di execute().
 */

const { sendSMS, sendEmail } = require('../lib/notify');
const { textToSpeech } = require('../lib/tts');
const { generatePdf } = require('../lib/documents');

async function searchWebsites(query, openai) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 800,
      messages: [
        { role: 'system', content: 'Sei un assistente informativo italiano. Rispondi in modo utile e preciso alla domanda dell\'utente usando la tua conoscenza generale. Rispondi sempre in italiano.' },
        { role: 'user', content: query }
      ]
    });
    return { content: response.choices[0].message.content };
  } catch (error) {
    console.error('Web search error:', error.message);
    return { content: 'Non sono riuscito a trovare informazioni.' };
  }
}

async function generateDocumentTool(title, content) {
  try {
    const { filename, size } = await generatePdf(title, content);
    const attachment = {
      url: `/uploads/${filename}`,
      name: `${title}.pdf`,
      mimeType: 'application/pdf',
      size,
      kind: 'document'
    };
    return {
      content: `Documento generato con successo: "${title}.pdf". Il file è già allegato al messaggio con un pulsante di download nell'interfaccia utente: nella tua risposta conferma semplicemente che il documento è pronto, senza inserire link, URL o markdown di download (non inventare URL, il download è già gestito dall'interfaccia).`,
      meta: { attachment }
    };
  } catch (err) {
    console.error('generatePdf error:', err.message);
    return { content: `Errore nella generazione del documento: ${err.message}` };
  }
}

function createToolExecutorAgent({ openai, ragAgent } = {}) {
  async function runOne(toolCall, ctx) {
    const { function: fn } = toolCall;
    let outcome;

    try {
      const parsedArgs = JSON.parse(fn.arguments);

      switch (fn.name) {
        case 'search_configured_sites': {
          const result = await ragAgent.search(parsedArgs.query, ctx.demo);
          outcome = {
            content: result.text,
            meta: { retrieval: { citations: result.citations, confidence: result.confidence, empty: result.empty, context: result.context } }
          };
          break;
        }
        case 'search_websites':
          outcome = await searchWebsites(parsedArgs.query, openai);
          break;
        case 'send_sms':
          outcome = { content: await sendSMS(parsedArgs.phone, parsedArgs.message) };
          break;
        case 'send_email':
          outcome = { content: await sendEmail(parsedArgs.to, parsedArgs.subject, parsedArgs.message) };
          break;
        case 'text_to_speech':
          outcome = { content: await textToSpeech(parsedArgs.text, parsedArgs.voice, parsedArgs.speed, openai) };
          break;
        case 'generate_document':
          outcome = await generateDocumentTool(parsedArgs.title, parsedArgs.content);
          break;
        default:
          outcome = { content: { error: 'Tool not implemented' } };
      }
    } catch (parseError) {
      outcome = { content: { error: 'Invalid arguments' } };
    }

    return { toolCall, outcome };
  }

  async function execute(toolCalls, ctx = {}) {
    const settled = await Promise.all(toolCalls.map(tc => runOne(tc, ctx)));

    const toolResults = settled.map(({ toolCall, outcome }) => ({
      tool_call_id: toolCall.id,
      role: 'tool',
      name: toolCall.function.name,
      content: typeof outcome.content === 'string' ? outcome.content : JSON.stringify(outcome.content)
    }));

    // Se il turno ha invocato piu' volte lo stesso tool, mantieni l'ordine
    // delle toolCalls (non l'ordine di completamento) per un comportamento
    // deterministico coerente con l'esecuzione sequenziale originale.
    let retrieval = {};
    let attachment = null;
    for (const { outcome } of settled) {
      if (outcome.meta && outcome.meta.retrieval) retrieval = outcome.meta.retrieval;
      if (outcome.meta && outcome.meta.attachment) attachment = outcome.meta.attachment;
    }

    return { toolResults, retrieval, attachment };
  }

  return { execute };
}

module.exports = { createToolExecutorAgent };
