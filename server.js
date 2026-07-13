// Load environment variables
require('dotenv').config();
const fs = require('fs');

// ─── Crash isolation ───────────────────────────────────────────────────────
// A bug surfacing while processing one demo's ingestion (a malformed page, a
// third-party API edge case) must never take down chat/auth/every other
// demo's session with it. Every async path in the knowledge engine already
// catches its own errors, but this is the last line of defense against
// anything that slips through — log it and keep serving.
process.on('unhandledRejection', (reason) => {
  console.error('🚨 Unhandled promise rejection (server kept running):', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught exception (server kept running):', err && err.stack ? err.stack : err);
});

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');
const OpenAI = require('openai');
const https = require('https');
const { execSync } = require('child_process');
const multer = require('multer');
const { buildSystemPrompt } = require('./src/config/prompts.js');
const { upload, classifyMime } = require('./src/lib/uploads');
const { transcribeAudio } = require('./src/lib/stt');

// Upload audio per l'input vocale (/api/chat/stt): in memoria, mai su disco
// (a differenza di `upload` sopra, che persiste gli allegati chat) — la
// registrazione viene scartata subito dopo la trascrizione.
const sttUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });


// ─── OpenAI Client ───────────────────────────────────────────────────────────
// Handle missing API key gracefully for Plesk deployment
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('✓ OpenAI client initialized');
} else {
  console.warn('⚠️ OPENAI_API_KEY not found in environment - AI features will be disabled');
}

// voiceMap / detectLanguage ora in src/lib/tts (importati sopra).

const app = express();

// Render (and other PaaS) terminate TLS at the edge and forward requests over
// HTTP. Telling Express to trust the proxy is required for `req.secure` /
// `secure: 'auto'` cookies and correct client IP handling.
app.set('trust proxy', 1);

const PORT = process.env.PORT || 7000;
const HTTPS_PORT = process.env.HTTPS_PORT || 7000;
const HTTP_PORT = process.env.HTTP_PORT || 3111;
const ENABLE_HTTPS = process.env.ENABLE_HTTPS !== 'false';
const ENABLE_HTTP = process.env.ENABLE_HTTP === 'true';

function loadOrGenerateCerts() {
  const certsDir = path.join(__dirname, 'certs');
  const certPath = process.env.SSL_CERT_PATH || path.join(certsDir, 'cert.pem');
  const keyPath = process.env.SSL_KEY_PATH || path.join(certsDir, 'key.pem');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath)
    };
  }

  fs.mkdirSync(path.dirname(certPath), { recursive: true });

  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${certPath}" -days 365 -subj "/CN=localhost"`,
      { stdio: 'pipe' }
    );
    console.log(`🔐 Generated self-signed SSL certificates at ${certsDir}`);
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath)
    };
  } catch (err) {
    console.error('❌ Unable to generate SSL certificates (openssl not available).');
    console.error('   Provide valid certs via SSL_CERT_PATH and SSL_KEY_PATH environment variables.');
    console.error('   Or install openssl and restart the server.');
    process.exit(1);
  }
}

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));

// Headers for iframe embedding
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'ALLOW-FROM *');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *");
  next();
});

// Session middleware - must be before routers
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    // 'auto' sets the Secure flag only when the request actually arrived over
    // HTTPS. Combined with `trust proxy` this is correct behind Render's
    // TLS-terminating proxy (Secure on the public HTTPS URL) and stays
    // non-Secure for plain-HTTP local dev so the cookie is still sent.
    secure: 'auto',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

// ─── Static files ──────────────────────────────────────────────────────────────
// Serve frontend files from root directory with proper path resolution
app.use(express.static(path.join(__dirname, 'public')));
// no-cache: forza il browser a rivalidare il bundle del widget ad ogni
// richiesta (via ETag/If-None-Match), cosi' un rebuild si vede subito senza
// bisogno di hard-refresh manuali.
app.use('/widget-src', express.static(path.join(__dirname, 'widget-src'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));
app.use('/Loghi', express.static(path.join(__dirname, 'Loghi')));
app.use('/uploads', express.static(path.join(__dirname, 'data', 'uploads')));
// ─── API Router ───────────────────────────────────────────────────────────────
// Create a sub-app for all API routes - MUST be defined before mounting
const apiRouter = express.Router();

// ─── Mount API Router ─────────────────────────────────────────────────────────
// Mount API routes at /api/ 
app.use('/api', apiRouter);

// ─── Helpers (shared) ───────────────────────────────────────────────────────
function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8'));
  } catch (error) {
    console.error('Error loading users.json:', error.message);
    return [];
  }
}

function loadDemos() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'demos.json'), 'utf8'));
  } catch (error) {
    console.error('Error loading demos.json:', error.message);
    return [];
  }
}

function saveDemos(demos) {
  try {
    fs.writeFileSync(path.join(__dirname, 'demos.json'), JSON.stringify(demos, null, 2));
  } catch (error) {
    console.error('Error saving demos.json:', error.message);
  }
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Non autenticato' });
  }
  next();
}

// URL validation API endpoint
apiRouter.post('/validate-url', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ 
      success: false, 
      error: 'URL is required' 
    });
  }
  
  try {
    // Validate URL format
    new URL(url);
    
    // Test URL accessibility
    const axios = require('axios');
    const response = await axios.head(url, {
      timeout: 5000,
      maxRedirects: 3,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    res.json({
      success: true,
      url: url,
      status: response.status,
      statusText: response.statusText,
      valid: true
    });
    
  } catch (error) {
    res.json({
      success: false,
      url: url,
      error: error.message,
      valid: false
    });
  }
});

// 4. Gestione della Home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login_comunicai.html'));
});

// API root — lightweight health-check response (this used to 404: it pointed
// at a public/index.html that doesn't exist in this project).
apiRouter.get('/', (req, res) => {
  res.json({ ok: true, service: 'xperiments-hospital-ai', status: 'running' });
});

// Login API
apiRouter.post('/login', async (req, res) => {
  console.log('🔐 Login attempt:', {
    username: req.body.username,
    product: req.body.product,
    hasPassword: !!req.body.password,
    timestamp: new Date().toISOString()
  });

  try {
    const { username, password, product } = req.body;

    if (!username || !password || !product) {
      console.log('❌ Login failed: Missing fields');
      return res.status(400).json({ error: 'Campi mancanti' });
    }

    const users = loadUsers();
    console.log('📋 Loaded users:', users.length);
    
    const user = users.find(u => u.username === username);
    if (!user) {
      console.log('❌ Login failed: User not found');
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    console.log('👤 User found:', { username: user.username, role: user.role, products: user.products });
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      console.log('❌ Login failed: Invalid password');
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    // Check if user has access to this product
    if (!user.products.includes(product)) {
      console.log('❌ Login failed: Product access denied');
      return res.status(403).json({ error: 'Accesso non autorizzato per questo prodotto' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      products: user.products,
      currentProduct: product
    };

    console.log('✅ Login successful:', { username: user.username, product: product });

    const configPage = product === 'comunicai' ? 'config_comunicai.html' : 'config_medicai.html';
    res.json({
      success: true,
      user: {
        name: user.name,
        role: user.role,
        products: user.products
      },
      redirect: `/${configPage}`
    });
  } catch (error) {
    console.error('💥 Login error:', error.message);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Logout API
apiRouter.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Check session API
apiRouter.get('/me', (req, res) => {
  console.log('🔍 Session check:', {
    hasSession: !!req.session,
    hasUser: !!req.session.user,
    timestamp: new Date().toISOString()
  });

  try {
    if (!req.session.user) {
      // Not authenticated is a normal state (e.g. login page load), not an error:
      // return 200 with user:null so clients don't surface a scary 401.
      console.log('ℹ️ Session check: nessun utente autenticato');
      return res.json({ user: null });
    }
    
    console.log('✅ Session check successful:', {
      username: req.session.user.username,
      product: req.session.user.currentProduct
    });
    
    res.json({ user: req.session.user });
  } catch (error) {
    console.error('💥 Session check error:', error.message);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Create demo API
apiRouter.post('/demos', requireAuth, (req, res) => {
  const { clientUrl, searchUrls, rootUrls, instructions, colors } = req.body;

  // Nuovo flusso: il commerciale inserisce SOLO il/гли root URL del sito.
  // Il crawling + embedding gira async (ingestion job) → knowledgeBaseId.
  const roots = Array.isArray(rootUrls) ? rootUrls.filter(Boolean) : [];
  const legacy = Array.isArray(searchUrls) ? searchUrls.filter(Boolean) : [];
  // UNICO flusso di costruzione knowledge:
  // tutti gli URL inseriti dal commerciale sono SEMI di crawling per crawler.js.
  // Il chatbot NON legge mai questi URL direttamente: passano solo alla pipeline crawler → ingest → index.
  const seeds = Array.from(new Set([...roots, ...legacy])).filter(Boolean);

  if (!clientUrl) {
    return res.status(400).json({ error: 'clientUrl (sfondo iframe) richiesto' });
  }
  if (seeds.length === 0) {
    return res.status(400).json({ error: 'Inserisci almeno un URL sorgente da indicizzare' });
  }

  // Validate URLs
  try {
    new URL(clientUrl);
    [...roots, ...legacy].forEach(url => new URL(url));
  } catch {
    return res.status(400).json({ error: 'URL non valido' });
  }

  // Default colors if not provided
  const defaultColors = {
    primary: '#00b4ff',
    secondary: '#0066cc',
    userBg: '#3b82f6',
    userText: '#ffffff',
    aiBg: '#e5e7eb',
    aiText: '#1f2937'
  };

  const demo = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    createdBy: req.session.user.username,
    product: req.session.user.currentProduct,
    clientUrl,
    // Gli URL inseriti sono SEMI per crawler.js (unico consumatore).
    // Il chatbot li usa solo indirettamente, tramite la knowledge base prodotta dalla pipeline.
    rootUrls: roots,
    searchUrls: legacy,
    seedUrls: seeds,
    knowledgeBaseId: seeds.length ? uuidv4() : null,
    instructions: instructions || '',
    colors: colors || defaultColors,
  };

  const demos = loadDemos();
  demos.push(demo);
  saveDemos(demos);

  // Avvia l'ingestion asincrona: knowledge engine (crawl + ingest streaming) → knowledge base.
  // Unico percorso fra gli URL inseriti dal commerciale e il chatbot. Il job è persistito
  // dall'engine stesso (data/knowledge-engine/): lo stato si legge sempre live da lì
  // (vedi src/lib/knowledge-status.js), niente da tenere sincronizzato qui.
  if (seeds.length) {
    try {
      knowledgeEngine.enqueueJob({ id: demo.knowledgeBaseId, seedUrls: seeds });
      console.log(`🗂️ Ingestion job accodato per ${demo.id} (kbId=${demo.knowledgeBaseId})`);
    } catch (err) {
      console.error('Ingestion enqueue error:', err.message);
    }
  } else {
    console.log(`⚠️ Nessun seed per demo ${demo.id}, ingestion non avviata`);
  }

  res.json({
    success: true,
    demo,
    demoUrl: `/demo.html?id=${demo.id}`
  });
});

// Stato live della knowledge base (crawl + ingest), letto direttamente
// dall'engine ad ogni chiamata — usato per fallback/backoffice.
apiRouter.get('/ingestion/:kbId/state', (req, res) => {
  res.json(deriveKnowledgeStatus(req.params.kbId));
});

// Streaming dello stato di ingestione (crawling → ingest → index) per la demo.
// Usato dal popup "Crea Demo" lato config: connette un EventSource e riceve
// uno snapshot live (fase + statistiche) ogni secondo, finché non è terminale.
apiRouter.get('/ingestion/:kbId/progress', (req, res) => {
  const kbId = req.params.kbId;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  try { res.flushHeaders(); } catch {}
  res.write('retry: 3000\n\n');

  const TERMINAL_PHASES = new Set(['ready', 'empty', 'failed', 'legacy']);
  let lastPayload = null;
  let poll = null;

  const send = () => {
    const payload = deriveKnowledgeStatus(kbId);
    const json = JSON.stringify(payload);
    if (json !== lastPayload) {
      try { res.write(`event: update\ndata: ${json}\n\n`); res.flush(); } catch {}
      lastPayload = json;
    }
    if (TERMINAL_PHASES.has(payload.phase)) {
      if (poll) clearInterval(poll);
      try { res.end(); } catch {}
    }
  };

  send();
  poll = setInterval(send, 1000);
  req.on('close', () => { if (poll) clearInterval(poll); });
});

// Get demo by ID (used by demo.html to load config)
apiRouter.get('/demos/:id', (req, res) => {
  const demos = loadDemos();
  const demo = demos.find(d => d.id === req.params.id);
  if (!demo) return res.status(404).json({ error: 'Demo non trovata' });
  res.json({ ...demo, knowledge: deriveKnowledgeStatus(demo.knowledgeBaseId) });
});

// Suggerimenti di domande per la demo (roadmap #2 J+K: zero-click suggestions)
// Alimenta i chip del widget e la welcome card "conosco il sito X".
function buildSuggestions(demo) {
  const product = demo.product || 'comunicai';
  let siteName = '';
  try { siteName = new URL(demo.clientUrl).hostname.replace(/^www\./, ''); } catch { siteName = ''; }

  const base = product === 'medicai'
    ? [
        'Come prenoto una visita?',
        'Quali sono gli orari di apertura?',
        'Dove si trova la struttura?',
        'Avete il reparto di cardiologia?',
        'Come parlo con un operatore?'
      ]
    : [
        'Come richiedo un certificato?',
        'Informazioni sulla TARI',
        'Orari ufficio anagrafe',
        'Come prenoto un appuntamento?',
        'Dove si trova l\'ufficio?'
      ];

  return {
    product,
    siteName,
    welcome: siteName
      ? `👋 Ciao! Conosco il sito ${siteName} e posso rispondere alle tue domande. Ecco da dove puoi iniziare:`
      : `👋 Ciao! Sono il tuo assistente e conosco questo sito. Ecco qualche domanda per iniziare:`,
    questions: base
  };
}

apiRouter.get('/demos/:id/suggestions', (req, res) => {
  const demos = loadDemos();
  const demo = demos.find(d => d.id === req.params.id);
  if (!demo) return res.status(404).json({ error: 'Demo non trovata' });
  res.json(buildSuggestions(demo));
});

// List demos for current user (optional, for dashboard)
apiRouter.get('/demos', requireAuth, (req, res) => {
  const demos = loadDemos();
  const user = req.session.user;
  const filtered = user.role === 'admin'
    ? demos
    : demos.filter(d => d.createdBy === user.username);
  const withStatus = filtered.map(d => ({ ...d, knowledge: deriveKnowledgeStatus(d.knowledgeBaseId) }));
  res.json(withStatus.reverse());
});

// Cancella una demo (admin: qualsiasi demo; altri utenti: solo le proprie).
// Best-effort cleanup della knowledge base associata (job + tabella vettoriale):
// non fa fallire la cancellazione della demo se la pulizia incontra un errore.
apiRouter.delete('/demos/:id', requireAuth, (req, res) => {
  const demos = loadDemos();
  const demo = demos.find(d => d.id === req.params.id);
  if (!demo) return res.status(404).json({ success: false, error: 'Demo non trovata' });

  const user = req.session.user;
  if (user.role !== 'admin' && demo.createdBy !== user.username) {
    return res.status(403).json({ success: false, error: 'Non autorizzato a cancellare questa demo' });
  }

  saveDemos(demos.filter(d => d.id !== demo.id));

  if (demo.knowledgeBaseId) {
    try { knowledgeEngine.cancelJob(demo.knowledgeBaseId); } catch (err) { console.error('cancelJob error:', err.message); }
    try {
      clearTableCache(demo.knowledgeBaseId);
      const dbPath = kbDbPath(demo.knowledgeBaseId);
      if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });
    } catch (err) {
      console.error('KB cleanup error:', err.message);
    }
  }

  res.json({ success: true });
});

// Demo Chat API - Uses shared chat service (con retrieval vettoriale)
apiRouter.post('/chat/message', async (req, res) => {
  await chatService.handleChat(req, res, openai, { rag });
});

// Chat attachment upload (immagini/documenti) - salvati in data/uploads/, serviti da /uploads
apiRouter.post('/chat/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File troppo grande (max 15MB)' : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Tipo di file non supportato' });
    }
    const kind = classifyMime(req.file.mimetype);
    res.json({
      success: true,
      data: {
        url: `/uploads/${req.file.filename}`,
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        kind
      }
    });
  });
});

// Demo TTS API - Uses shared chat service
apiRouter.post('/chat/tts', async (req, res) => {
  const { text, voice = 'alloy', speed = 1.0 } = req.body;
  
  if (!text) {
    return res.status(400).json({ success: false, error: 'Text is required' });
  }

  try {
    const result = await chatService.textToSpeech(text, voice, speed, openai);
    if (result.success) {
      return res.json({
        success: true,
        data: { audio: result.audio }
      });
    } else {
      return res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('TTS error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Demo STT API - input vocale del widget: audio registrato dal browser →
// testo (Whisper). File tenuto in memoria e scartato subito dopo, non
// finisce mai su disco (a differenza degli allegati chat persistenti).
apiRouter.post('/chat/stt', (req, res) => {
  sttUpload.single('audio')(req, res, async (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Audio troppo grande (max 15MB)' : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'File audio richiesto' });
    }
    try {
      const result = await transcribeAudio(req.file.buffer, req.file.originalname, req.file.mimetype, openai);
      res.json({ success: true, data: { text: result.text } });
    } catch (error) {
      console.error('STT error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

// Demo Chat Clear API
apiRouter.post('/chat/clear', (req, res) => {
  const { sessionId } = req.body;
  chatService.clearChatSession(sessionId);
  res.json({ success: true });
});

// ─── Chat Sessions Store ─────────────────────────────────────────────────────
const chatSessions = new Map();

// Define available tools for the AI
// tools -> definiti in src/lib/tools (importati sopra come `tools`)

// URL validation cache to avoid redundant checks
const urlValidationCache = new Map();

// Enhanced Chat Service instance
let enhancedChatService = null;

// Initialize Enhanced Chat Service
async function initEnhancedChatService() {
  if (!enhancedChatService) {
    enhancedChatService = new EnhancedChatService();
    console.log('🚀 Enhanced Chat Service initialized');
  }
  return enhancedChatService;
}

// Monitoring System
const { MonitoringSystem } = require('./src/services/monitoring-system.js');
const monitoring = new MonitoringSystem();

// Chat Service
const chatService = require('./src/services/chat-service.js');

// ─── Shared lib (Fase 1: single source of truth) ─────────────────
const { textToSpeech, voiceMap, detectLanguage } = require('./src/lib/tts');
const { getTools } = require('./src/lib/tools');
const { sendSMS, sendEmail } = require('./src/lib/notify');
const { getDemoById } = require('./src/lib/storage');

// ─── RAG retrieval (path primario) + knowledge ingestion engine ──
const { createRag } = require('./src/pipeline/rag');
const knowledgeEngine = require('./src/knowledge-engine');
const { deriveKnowledgeStatus } = require('./src/lib/knowledge-status');
const { kbDbPath, clearTableCache } = require('./src/lib/lancedb');

let rag = null;
if (openai) {
  rag = createRag({ openai });
}

// Nessun ri-aggancio manuale necessario al riavvio: il knowledge engine
// riprende da solo i job interrotti (stato persistito in
// data/knowledge-engine/), e lo stato è sempre letto live da lì
// (deriveKnowledgeStatus), quindi non c'è nulla da tenere sincronizzato
// qui — anche un popup "Creazione Demo" riconnesso dopo un riavvio del
// server vede subito lo stato corretto alla prima chiamata SSE.

// Tool schemas (prima duplicati qui e in chat-service.js)
const tools = getTools();

// Initialize monitoring
monitoring.start();
console.log('📊 Monitoring system started');

// ─── searchWebsites — per query generali (conoscenza generale OpenAI) ───────
async function searchWebsites(query) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: `Sei un assistente informativo italiano. Rispondi in modo utile e preciso alla domanda dell'utente usando la tua conoscenza generale. Rispondi sempre in italiano.`
        },
        { role: 'user', content: query }
      ]
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Web search error:', error.message);
    return 'Non sono riuscito a trovare informazioni. Riprova più tardi.';
  }
}
// sendSMS / sendEmail -> src/lib/notify (importati sopra)
// textToSpeech / voiceMap / detectLanguage -> src/lib/tts (importati sopra)

// Helper function to filter history for API (exclude tool_calls)
function filterHistoryForAPI(history) {
  return history.filter(msg => {
    // Exclude only assistant messages with tool_calls
    if (msg.role === 'assistant' && msg.tool_calls) {
      return false;
    }
    return true;
  });
}

// ─── Monitoring API Endpoints ─────────────────────────────────────────────────
// Get monitoring status
apiRouter.get('/monitoring/status', (req, res) => {
  try {
    const report = monitoring.generateReport();
    res.json({
      monitoring: monitoring.isMonitoring,
      config: monitoring.config,
      metrics: {
        apiCalls: monitoring.metrics.apiCalls.length,
        searchResults: monitoring.metrics.searchResults.length,
        systemHealth: monitoring.metrics.systemHealth.length,
        errors: monitoring.metrics.errors.length,
        performance: monitoring.metrics.performance.length
      },
      alerts: {
        total: monitoring.alerts.length,
        unacknowledged: monitoring.alerts.filter(a => !a.acknowledged).length
      },
      summary: report.summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recent metrics
apiRouter.get('/monitoring/metrics', (req, res) => {
  try {
    res.json(monitoring.getRecentMetrics());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recent alerts
apiRouter.get('/monitoring/alerts', (req, res) => {
  try {
    res.json(monitoring.getRecentAlerts());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get full monitoring report
apiRouter.get('/monitoring/report', (req, res) => {
  try {
    res.json(monitoring.generateReport());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get or update monitoring config
apiRouter.get('/monitoring/config', (req, res) => {
  try {
    res.json(monitoring.config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/monitoring/config', (req, res) => {
  try {
    monitoring.config = { ...monitoring.config, ...req.body };
    monitoring.saveConfig();
    res.json({ success: true, config: monitoring.config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual health check endpoint
apiRouter.get('/monitoring/health-check', async (req, res) => {
  try {
    const health = await monitoring.performHealthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Acknowledge alert
apiRouter.post('/monitoring/alerts/:id/acknowledge', (req, res) => {
  try {
    const alertId = req.params.id;
    const alert = monitoring.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      res.json({ success: true, alert });
    } else {
      res.status(404).json({ error: 'Alert not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────
// Move listen to the very end to ensure all routes and middleware are defined first
function startServer() {
  // Render (and most PaaS) inject PORT and terminate TLS at the edge, so we
  // listen as plain HTTP on that port. Without this the app would bind to a
  // fixed dev port and Render's health check would fail to reach it.
  if (process.env.PORT) {
    app.listen(process.env.PORT, '0.0.0.0', () => {
      console.log(`\n🌐 Demo Generator running on injected PORT ${process.env.PORT} (TLS terminated upstream)`);
    });
  }

  if (ENABLE_HTTPS) {
    const httpsOptions = loadOrGenerateCerts();
    const httpsServer = https.createServer(httpsOptions, app);
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`\n🚀 Demo Generator running at https://localhost:${HTTPS_PORT}`);
      console.log(`   ComunicAI → https://localhost:${HTTPS_PORT}/comunicai/login.html`);
      console.log(`   MedicAI   → https://localhost:${HTTPS_PORT}/medicai/login.html`);
      console.log(`\n⚠️  If using self-signed certs, accept the browser warning or replace with valid certs.`);
      console.log(`   Set SSL_CERT_PATH and SSL_KEY_PATH in .env to use your own certificates.\n`);
    });
  }

  if (ENABLE_HTTP) {
    app.listen(HTTP_PORT, () => {
      console.log(`\n🌐 HTTP server running at http://localhost:${HTTP_PORT}`);
      console.log(`   ComunicAI → http://localhost:${HTTP_PORT}/comunicai/login.html`);
      console.log(`   MedicAI   → http://localhost:${HTTP_PORT}/medicai/login.html\n`);
    });
  }
}

startServer();
