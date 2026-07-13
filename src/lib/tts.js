'use strict';

/**
 * tts.js — Logica Text-To-Speech condivisa (OpenAI-only).
 *
 *   textToSpeech(text, voice, speed, openai)
 */

const voiceMap = {
  it: 'it-IT-Stella',
  en: 'en-US-Alloy',
  de: 'de-DE-Bernd',
  fr: 'fr-FR-Vivienne',
  ar: 'ar-SA-Zeina'
};

function detectLanguage(text) {
  const italianPatterns = /\b(il|lo|la|di|da|in|con|per|tra|frra|gli|sono|essere|avere|fare|volevo|possso|come|cosa|dove|quando|perché|grazie|buongiorno|buonasera|prego|scusi|perdoni|chiedere|rispondere|comunicare|informare|richiedere|ottenere|documento|certificato|ufficio|anagrafe|tributi|imposta|tassa|servizio|appuntamento|prenotazione)\b/i;
  const germanPatterns = /\b(der|die|das|ein|eine|und|oder|aber|nicht|sein|haben|werden|können|müssen|sollen|wollen|bitte|danke|guten|morgen|abend|herr|frau|ich|du|wir|sie|es|hat|ist|war|werden)\b/i;
  const frenchPatterns = /\b(le|la|les|un|une|du|des|et|ou|mais|ne|pas|être|avoir|pouvoir|vouloir|doit|falloir|savoir|merci|bonjour|bonsoir|madame|monsieur|je|tu|nous|vous|ils|elle|est|sont|était|été)\b/i;
  const arabicPatterns = /[\u0600-\u06FF]/;

  if (arabicPatterns.test(text)) return 'ar';
  if (italianPatterns.test(text)) return 'it';
  if (germanPatterns.test(text)) return 'de';
  if (frenchPatterns.test(text)) return 'fr';
  return 'en';
}

async function openaiTextToSpeech(text, voice = 'alloy', speed = 0.9, openai) {
  const mp3 = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice,
    input: text,
    speed
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  const base64 = buffer.toString('base64');

  return {
    success: true,
    audio: `data:audio/mpeg;base64,${base64}`,
    message: 'Audio generato con OpenAI TTS'
  };
}

async function textToSpeech(text, voice = 'alloy', speed = 1.0, openai) {
  const lang = detectLanguage(text);
  const voiceName = voiceMap[lang] || voice;
  return await openaiTextToSpeech(text, voiceName, speed, openai);
}

module.exports = { voiceMap, detectLanguage, textToSpeech };
