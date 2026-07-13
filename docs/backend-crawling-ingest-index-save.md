# Documentazione — Flusso Backend: Configurazione Demo → Crawling → Ingest → Indicizzazione → Dato Salvato

> Scopo: tracciare, passo passo, cosa succede nel backend da quando l'utente commerciale clicca **"Crea Demo"** in `config.html` (punto A) fino al momento in cui la demo è pronta, con la knowledge base creata, indicizzata e usata per rispondere (punto Z). Il frontend (widget React, stili, etc.) è deliberatamente ignorato.
>
> **Nota di architettura (aggiornamento):** il backend di *risposta alle domande* (fase Z) non è più una catena di chiamate API/branch inline dentro `chat-service.js`, ma un **sistema a micro-agenti** orchestrato da un singolo modello (`gpt-4o-mini`, il *copywriter*). Un `orchestrator.js` coordina 9 micro-agenti, ognuno con un ruolo specializzato (memoria, persistenza, routing, planning query, retrieval RAG, guardrail, esecuzione tool, copywriting, QA). La pipeline di *produzione della knowledge base* (crawling → ingest → indicizzazione, punti C–G) resta invariata.

---

## Glossario rapido

| Termine | Significato |
|---|---|
| **kbId** | `knowledgeBaseId` — UUID che identifica univocamente la knowledge base di una demo. Usato come namespace per tutti gli store (SQLite, LanceDB, jobs). |
| **demoId** | UUID della demo stessa, usato nell'URL (`/demo.html?id=<demoId>`) e come chiave in `demos.json`. |
| **seed URL** | URL radice inserito dal commerciale in config.html; è il punto di partenza del crawler. |
| **CrawlDb** | SQLite per-job (`data/knowledge-engine/jobs/<kbId>.sqlite`): memorizza frontier URL, pagine fetch ate, contatori, lease. |
| **jobsDb** | SQLite globale (`data/knowledge-engine/jobs.sqlite`): registro di tutti i job di ingestion con stato, heartbeat, owner. |
| **LanceDB** | DB vettoriale su filesystem (`data/lancedb/<kbId>/documents`): memorizza i chunk vettorializzati pronti per il retrieval RAG. |
| **JobRunner** | Classe che avvia CrawlWorker + IngestWorker in parallelo e gestisce il ciclo di vita di un job. |
| **JobManager** | Singleton che accoda job, limita la concorrenza, reclaim job orfani. |
| **deriveKnowledgeStatus** | Funzione che legge lo stato live dal jobsDb e lo traduce in fase UI (`pending`, `crawling`, `embedding`, `indexing`, `ready`, `empty`, `failed`). |
| **Orchestrator** | `src/orchestrator.js` — entrypoint di un turno di chat. Sostituisce l'ex `handleChat` monolitico e coordina i micro-agenti in sequenza/fase. |
| **Micro-agenti** | 9 moduli specializzati in `src/agents/` che incapsulano ciascuno una responsabilità (vedi *Architettura a micro-agenti*). |
| **Copywriter (modello)** | Il modello unico `gpt-4o-mini` che genera tutto il testo in streaming; pilotato dall'orchestratore e supportato dagli altri agenti. |
| **router-agent** | Sceglie quali tool sono disponibili per il turno (euristica su `knowledgeBaseId`). |
| **query-planner-agent** | Riscrive la query di retrieval quando è lunga/complessa (gpt-4o-mini). |
| **rag-agent** | Esegue il retrieval sulla KB indicizzata, deduplica le citazioni e calcola la confidence. |
| **guardrail-agent** | Controlli di sicurezza su input (regex anti-injection) e sanificazione output (link finti allegati). |
| **tool-executor-agent** | Dispatch/esecuzione dei `tool_calls` richiesti dal copywriter (in parallelo). |
| **memory-agent** | Storico conversazioni per sessione (Map in-memory). |
| **database-agent** | Unico punto di lettura dei dati demo (`getDemoById`). |
| **copywriter-agent** | Wrapper di streaming verso gpt-4o-mini (accumula testo + `tool_calls`). |
| **qa-agent** | Verifica di qualità advisory-only post-generazione (corregge solo la `confidence`). |

---

## Panoramica architetturale

```
┌─────────────────┐     POST /api/demos      ┌──────────────────────┐
│  config.html    │ ────────────────────────> │   server.js (Express)│
│  (punto A)      │                            └──────────┬───────────┘
│                 │                                        │
│ 1. Inserisce    │   2. Crea record in                    │ 3. Enqueue job
│    clientUrl +  │      demos.json                        │    in knowledgeEngine
│    seedUrls     │   4. Restituisce                       │
│                 │      demoId + kbId                     │
└─────────────────┘                                        ▼
                                                 ┌──────────────────────┐
                                                 │   Knowledge Engine    │
                                                 │  (src/knowledge-      │
                                                 │    engine/)           │
                                                 └──────────┬───────────┘
                                                 │           │
                                                 │  Crawl    │  Ingest
                                                 │  Worker   │  Worker
                                                 │           │
                                                 ▼           ▼
                                          ┌─────────────┐  ┌─────────────┐
                                          │   CrawlDb   │  │  Embedding  │
                                          │  (SQLite)   │  │  (OpenAI)   │
                                          │  urls/pages │  │             │
                                          └─────────────┘  └──────┬──────┘
                                                                   │
                                                                   ▼
                                                          ┌─────────────────┐
                                                          │    LanceDB      │
                                                          │  (vettoriale)   │
                                                          └────────┬────────┘
                                                                   │
                                                                   ▼
                                                          ┌─────────────────┐
   config.html ◄── SSE /poll State ◄─ deriveKnowledgeStatus  │  HNSW-PQ Index  │
   (popup progresso)          ▲                         ▲   └────────┬────────┘
                              │                         │            │
                     ┌────────┴────────┐       ┌───────┴────────────┴──────────┐
                     │  /ingestion/:kbId│       │   demo.html (punto Z)          │
                     │  /progress (SSE) │       │   POST /api/chat/message        │
                     └─────────────────┘       └───────────────┬────────────────┘
                                                               │
                                                               ▼
                                                ┌──────────────────────────────┐
                                                │  Orchestrator (1 modello)     │
                                                │  src/orchestrator.js           │
                                                │                                │
                                                │  ┌────────────────────────┐    │
                                                │  │  Micro-agenti           │    │
                                                │  │  memory · database ·    │    │
                                                │  │  router · query-planner │    │
                                                │  │  rag · guardrail ·      │    │
                                                │  │  tool-executor ·         │    │
                                                │  │  copywriter · qa         │    │
                                                │  └────────────────────────┘    │
                                                │        │                       │
                                                │        ▼                       │
                                                │  gpt-4o-mini (copywriter)      │
                                                │        │                       │
                                                │        ▼                       │
                                                │  rag.retrieve() → LanceDB      │
                                                └──────────────────────────────┘
 ```

---

## Punto A — Configurazione in `config.html`

### File coinvolti

| File | Ruolo |
|---|---|
| `public/config_medicai.html` | Pagina di configura per il prodotto MedicAI |
| `public/config_comunicai.html` | Pagina di configurazione per il prodotto ComunicAI |
| `public/auth.js` | Gestione sessione: `checkAuth(product)` → chiama `/api/me` |

### Flusso

1. L'utente arriva su `config_medicai.html` (o `config_comunicai.html`). La pagina include `auth.js` che verifica la sessione esistente: se non c'è, redirect al login.
2. Il commerciale compila il form:
   - **clientUrl** — URL del sito cliente da mostrare nell'iframe della demo.
   - **seedUrls** — uno o più URL sorgente da cui partire per il crawling. Possono essere uguali al `clientUrl` o diversi.
   - **instructions** — testo opzionale che guida/limita le risposte del chatbot.
   - **colors** — personalizzazione colori (primary, secondary, userBg, userText, aiBg, aiText).
3. Al click su **"CREA DEMO"**, il frontend:
   - Valida ogni URL con `POST /api/validate-url` (controlla formato + raggiungibilità HTTP HEAD).
   - Chiama `POST /api/demos` con body:
     ```json
     {
       "clientUrl": "https://www.comune-esempio.it",
       "searchUrls": ["https://www.comune-esempio.it"],
       "instructions": "Rispondi solo in italiano...",
       "colors": { "primary": "#1a8c5c", ... }
     }
     ```
4. La risposta API contiene:
   - `success: true`
   - `demo` — oggetto completo della demo (incluso `knowledgeBaseId`)
   - `demoUrl` — `/demo.html?id=<demoId>`
5. Il frontend apre il popup di progresso (`openProgressPopup`) che si connette a:
   - `EventSource('/api/ingestion/<kbId>/progress')` — streaming SSE con aggiornamenti ogni secondo.
   - Fallback a polling ogni 2s su `/api/ingestion/<kbId>/state` se SSE non è disponibile.

---

## Punto B — Creazione Demo: `POST /api/demos`

### File coinvolto

`server.js` — route `apiRouter.post('/demos', requireAuth, ...)`

### Cosa succede

1. **Validazione input**: controlla che `clientUrl` esista e che ci sia almeno un URL tra `rootUrls` e `searchUrls`.
2. **Costruzione oggetto demo**:
   ```js
   const demo = {
     id: uuidv4(),                    // demoId
     createdAt: ISO timestamp,
     createdBy: req.session.user.username,
     product: 'comunicai' | 'medicai',
     clientUrl,
     rootUrls: filtro root,
     searchUrls: legacy,
     seedUrls: unione dedup di rootUrls + searchUrls,
     knowledgeBaseId: seeds.length ? uuidv4() : null,  // kbId
     instructions,
     colors
   };
   ```
3. **Persistenza demo**: il nuovo oggetto viene pushato nell'array `demos` e salvato su `demos.json` tramite `saveDemos()`.
4. **Avvio ingestion asincrona**:
   ```js
   knowledgeEngine.enqueueJob({ id: demo.knowledgeBaseId, seedUrls: seeds });
   ```
   Questo avvia il motore di knowledge in background. La risposta API è immediata — l'utente riceve il `demoUrl` e il popup di progresso si apre.

---

## Punto C — Knowledge Engine: Accodamento Job

### File coinvolti

| File | Ruolo |
|---|---|
| `src/knowledge-engine/index.js` | Entrypoint pubblico: `enqueueJob`, `getJobStatus`, `cancelJob`, `resumeJob` |
| `src/knowledge-engine/config.js` | Defaults: `maxDepth: 5`, `maxPages: 500`, `crawlConcurrency: 8`, `ingestConcurrency: 3`, ecc. |
| `src/knowledge-engine/jobs/job-manager.js` | `JobManager` — decide quale job eseguire, gestisce heartbeat/lease |
| `src/knowledge-engine/jobs/job-runner.js` | `JobRunner` — costruisce CrawlWorker + IngestWorker e li avvia in parallelo |
| `src/knowledge-engine/storage/jobs-db.js` | JobsDb — SQLite globale `data/knowledge-engine/jobs.sqlite` |

### Flusso

1. `enqueueJob(job)` chiama `requireOpenai()` → crea client OpenAI se non esiste.
2. `JobManager.enqueueJob()`:
   - Valida `seedUrls`.
   - Genera `id` se non fornito (nel nostro caso è il `kbId`).
   - Chiama `jobsDb.upsertQueued()` che inserisce/aggiorna la riga in `jobs.sqlite` con `status = 'queued'`.
   - Chiama `_pump()` che prova a far partire il job immediatamente se c'è concurrency disponibile.
3. `_pump()` cerc un job `queued` non ancora attivo, lo marca `running` con un `ownerId` univoco (`hostname:pid:random`), e crea un `JobRunner`.
4. Il `JobRunner` costruisce:
   - `CrawlDb(dbPathForJob(kbId))` — apre/crea il SQLite per-job.
   - `PageFetcher` — shared Puppeteer + HTTP-first fetcher.
   - `CrawlWorker` — orchestrazione del crawling.
   - `EmbeddingStage` — wrapper condiviso per l'embedder OpenAI + cache LRU + throttle.
   - `IngestWorker` — consuma pagine, produce chunk, chiama embedding, salva in LanceDB.
5. `JobRunner.run()`:
   - Avvia un timer che ogni 3s salva le statistiche nel `jobsDb` e invia heartbeat (prova di vita).
   - Chiama `crawler.seed(seedUrls)`.
   - Avvia `crawler.run()` e `ingest.run()` in parallelo con `Promise.all`.
   - Alla fine, chiama `vectorStore.buildIndex(kbId)` per creare l'indice HNSW-PQ in LanceDB.

---

## Punto D — Crawling: `CrawlWorker` + `PageFetcher`

### File coinvolti

| File | Ruolo |
|---|---|
| `src/knowledge-engine/crawler/crawler.js` | `CrawlWorker` — scopre URL, li fetcha, estrae document + links |
| `src/knowledge-engine/crawler/fetcher.js` | `PageFetcher` — HTTP-first, fallback Puppeteer |
| `src/knowledge-engine/crawler/robots.js` | `RobotsGate` — cache robots.txt per host |
| `src/knowledge-engine/crawler/sitemap.js` | `discoverSitemapUrls` — bootstrap da sitemap.xml |
| `src/knowledge-engine/extraction/document.js` | `extractDocument` — HTML → testo pulito + outgoing links |
| `src/knowledge-engine/storage/crawl-db.js` | `CrawlDb` — persistenza frontier + pagine |

### Flusso dettagliato

#### 1. Seed
`CrawlWorker.seed(seedUrls)`:
- Normalizza ogni URL (strip tracking params, lower case host, rimuove fragment).
- Inserisce nella tabella `urls` del CrawlDb con `status='queued'`, `depth=0`, `priority=1000`, `discoveredFrom='seed'`.
- Per ogni seed, tenta di leggere `sitemap.xml` dall'origine. Ogni URL trovato viene inserito come `discoveredFrom='sitemap'`, `priority=100`, mantenendo dedup automatico (UNIQUE su `url`).

#### 2. Frontier loop
`CrawlWorker.run()`:
- Ogni iterazione:
  - `reclaimStaleUrlLeases()` — recupera URL "leased" scadute (per crash recovery).
  - Calcola budget: `maxPages` meno pagine già fetchate meno in-flight.
  - `claimUrlBatch(n, ownerId, leaseMs)` — preleva fino a `n` URL `queued`, marca `leased` con scadenza.
  - Per ogni URL claimed, lancia `_processUrl()` concorrentemente (max 8 in-flight globali, max 3 per host).

#### 3. Fetch pagina
`PageFetcher.fetch(url)`:
- Prima tenta **HTTP GET** diretto (headers browser-like). Se la risposta ha status 2xx, content-type HTML e body con almeno 200 caratteri di testo utile → ok.
- Altrimenti, fallback a **Puppeteer**: lancia Chromium headless, naviga alla pagina, attende `domcontentloaded`, estrae `page.content()`. Aborta risorse non essenziali (immagini, font, PDF). Il browser è condiviso tra tutti i fetch e ri-lanciato automaticamente se crasha.

#### 4. Estrazione
`extractDocument(html, url)`:
- Usa **Mozilla Readability** per estrarre contenuto articolo-like.
- Fallback a **boilerplate stripping** (rimuove nav, header, footer, cookie banner, sidebar, ecc.) e raccoglie testo da `h1..h6`, `p`, `li`, `td`, `dt`, `dd`.
- Estrae tutti gli `<a href>` → normalizza e filtra link non HTTP, già visitati, o fuori scope (`sameSiteOnly`).
- Restituisce `{ url, canonicalUrl, title, description, lang, text, links }`.

#### 5. Persistenza
- `store.upsertPage({...})` — inserisce/aggiorna riga nella tabella `pages` con `ingest_status='pending'`. Questa persistenza avviene **prima** di qualsiasi valutazione di qualità: il fatto che la pagina esista nel DB è la garanzia di durabilità.
- `store.markUrlFetched(url)` — marca l'URL in frontier come `fetched`.
- Se `depth + 1 <= maxDepth`, tutti i link estratti vengono inseriti come nuovi URL `queued` con `depth+1` e `priority=0`.

#### 6. Isolamento fallimenti
- Un fetch che fallisce viene marcato `failed` con retry exponential backoff (max 6 tentativi). Non blocca il resto del crawl.

---

## Punto E — Ingest: `IngestWorker` (Chunking + Embedding + LanceDB)

### File coinvolti

| File | Ruolo |
|---|---|
| `src/knowledge-engine/ingestion/ingest-worker.js` | `IngestWorker` — consuma pagine dalla coda, produce chunk, li vettorizza, li salva |
| `src/knowledge-engine/chunking/chunker.js` | `chunkDocument` — chunking semantico token-aware (tiktoken) |
| `src/knowledge-engine/embedding/embedder.js` | `createEmbeddingStage` — wrapper per OpenAI embeddings |
| `src/lib/embeddings.js` | `createEmbedder` — cache LRU + throttle globale per le chiamate OpenAI |

### Flusso dettagliato

`IngestWorker.run()` gira in parallelo al crawler:

1. **Claim batch di pagine**: `store.claimPageBatch(ingestConcurrency, ownerId, leaseMs)` preleva pagine con `ingest_status='pending'`, le marca `leased`. Max 3 in-flight per l'ingest.
2. **Dedup contenuto**: controlla se `content_hash` della pagina è già noto nella tabella `content_hashes`. Se sì, salta la pagina come duplicato.
3. **Chunking**:
   ```js
   const chunks = chunkDocument({ url, title, text });
   ```
   Ogni pagina viene spezzata in chunk token-aware:
   - Target: ~1000 token per chunk (`CHUNK_TOKENS`).
   - Overlap: 150 token tra chunk consecutivi.
   - Min chunk: 120 caratteri, max 6000.
   - Hard cap: max 400 chunk per pagina.
   - Ogni chunk riceve un `hash = sha256("TITLE: ...\nURL: ...\n\nCONTENT:\n...")`.
4. **Filtro chunk già indicizzati**: carica `seenHashes` da LanceDB (`loadIndexedHashes`). Solo i chunk con hash nuovo procedono all'embedding (idempotenza).
5. **Embedding batch**: chiama OpenAI `text-embedding-3-small` in batch di max 100 chunk per chiamata. Throttle globale: minimo 1200ms tra batch per evitare 429. 5 retry con backoff.
6. **Salvataggio LanceDB**:
   ```js
   await vectorStore.insertChunks(kbId, rows);
   ```
   Ogni riga contiene: `vector[]`, `text`, `title`, `url`, `site`, `hash`, `chunkIndex`, `chunkCount`, `createdAt`.
   La tabella LanceDB è `data/lancedb/<kbId>/documents`.
7. **Aggiornamento contatori**: `chunks_created`, `chunks_indexed`, `pages_ingested`, `pages_duplicate` vengono bumpati nel CrawlDb.
8. **Mark done**: `store.markPageDone(url)` → `ingest_status='done'`.
9. Il ciclo continua finché il crawler è completato **e** non ci sono più pagine pending/leased.

---

## Punto F — Costruzione Indice HNSW-PQ in LanceDB

### File coinvolto

`src/knowledge-engine/vectorstore/lancedb-store.js`

Dopo che `Promise.all([crawlPromise, ingestPromise])` si risolve in `JobRunner.run()`:

1. `vectorStore.buildIndex(kbId)`:
   - Conta righe nella tabella LanceDB.
   - Se `< 256` vettori, non costruisce l'indice (ricerca exact suffice).
   - Altrimenti crea indice **HNSW-PQ** con `distanceType='cosine'`, `m=16`, `efConstruction=150`, `numPartitions=1`.
2. Salva il job come `completed` nel `jobsDb`.

---

## Punto G — Tracking Stato Live: SSE + Polling

### File coinvolti

| File | Ruolo |
|---|---|
| `server.js` — route `GET /api/ingestion/:kbId/state` | Lettura snapshot status |
| `server.js` — route `GET /api/ingestion/:kbId/progress` | Streaming SSE |
| `src/lib/knowledge-status.js` | `deriveKnowledgeStatus` — mappa stato DB → vocabolario UI |

### Flusso

1. Il popup progresso in `config.html` si connette a:
   - `EventSource('/api/ingestion/<kbId>/progress')` → riceve eventi `update` ogni secondo fino a fase terminale.
   - Oppure polling `setInterval` su `/api/ingestion/<kbId>/state` ogni 2s.
2. `deriveKnowledgeStatus(kbId)`:
   - Chiama `engine.getJobStatus(kbId)` → legge dal `jobsDb`.
   - Mappa `job.status` in `phase`:
     - `queued` → `pending`
     - `running` + `!crawlComplete` → `crawling`
     - `running` + `crawlComplete` + `pagesPendingIngest > 0` → `embedding`
     - `running` + `crawlComplete` + `pagesPendingIngest === 0` → `indexing`
     - `completed` + `chunksIndexed > 0` → `ready`
     - `completed` + `chunksIndexed === 0` → `empty`
     - `failed`/`cancelled` → `failed`
     - `null` (job non trovato) → `pending` per compatibilità riconsezione SSE
3. Il JSON restituito contiene: `phase`, `ready`, `empty`, `error`, `stats` (fetchedUrls, discoveredUrls, failedUrls, chunksIndexed, throughputPagesPerMin, etaMs, ecc.).
4. Il frontend aggiorna il popup: badge di stato, numeri delle 4 stat cards, messaggio di ETA.

---

## Punto Z — Demo Pronta: Utilizzo tramite `demo.html`

### File coinvolti

| File | Ruolo |
|---|---|
| `public/demo.html` | Pagina che carica la demo, iframe del sito cliente, widget chat |
| `server.js` — `GET /api/demos/:id` | Restituisce dati demo + knowledge status |
| `server.js` — `POST /api/chat/message` | Invia messaggio chat → orchestratore micro-agenti |
| `src/services/chat-service.js` — `handleChat` | Adapter HTTP sottile: delega a `orchestrateChat` |
| `src/orchestrator.js` — `orchestrateChat` | Coordina i micro-agenti per un turno di chat |
| `src/agents/*.js` | I 9 micro-agenti specializzati (vedi sotto) |
| `src/pipeline/rag.js` — `retrieve` | Retrieval vettoriale da LanceDB (usato dal rag-agent) |

### Backend di risposta: sistema a micro-agenti

Il backend non è più una catena di chiamate API/branch inline dentro `chat-service.js`, ma un **orchestratore** che pilota un **singolo modello** (`gpt-4o-mini`, il *copywriter*) supportato da **9 micro-agenti**, ognuno con un ruolo ben definito. Il contratto HTTP/SSE verso il widget resta identico (stesso body di richiesta, stessi eventi `chunk`/`done`/`error`, stessa shape del `done`).

#### Ruoli dei micro-agenti

| Agente | File | Ruolo | Dipendenze |
|---|---|---|---|
| **memory-agent** | `src/agents/memory-agent.js` | Storico conversazioni per `sessionId` (Map in-memory, nessuna persistenza). Interfaccia `getHistory`/`append`/`clear`. | — |
| **database-agent** | `src/agents/database-agent.js` | Unico punto di lettura dei dati demo: `getDemo(demoId)` → `getDemoById`. | `src/lib/storage.js` |
| **router-agent** | `src/agents/router-agent.js` | Decide quali tool sono disponibili per il turno (euristica booleana su `knowledgeBaseId`, via `getToolsForDemo`). Nessuna chiamata LLM. | `src/lib/tools.js` |
| **query-planner-agent** | `src/agents/query-planner-agent.js` | Riscrive la query di retrieval solo se lunga (>80 char o >6 parole) tramite `gpt-4o-mini`. | OpenAI |
| **rag-agent** | `src/agents/rag-agent.js` | Retrieval sulla KB: invoca `rag.retrieve`, deduplica citazioni per URL (score max), calcola `confidence`, formatta il blocco di contesto. | query-planner-agent, `rag` |
| **guardrail-agent** | `src/agents/guardrail-agent.js` | `checkInput` (regex anti-injection) e `checkOutput` (rimuove link finti `sandbox:` negli allegati). Bias verso non-bloccare. | — |
| **tool-executor-agent** | `src/agents/tool-executor-agent.js` | Esegue i `tool_calls` del copywriter **in parallelo** (`Promise.all`), aggrega `toolResults`/citations/attachment. | rag-agent, `lib/notify`, `lib/tts`, `lib/documents` |
| **copywriter-agent** | `src/agents/copywriter-agent.js` | Wrapper di streaming verso `gpt-4o-mini`: accumula testo + `tool_calls` frammentati e li forwarda via `onChunk`. | OpenAI |
| **qa-agent** | `src/agents/qa-agent.js` | Verifica quality *advisory-only* post-generazione: restituisce una `confidence` (0–1) con timeout 400ms. Corregge solo la `confidence`, mai testo/citazioni. | OpenAI |

#### Flusso di orchestrazione (`orchestrateChat`)

```
POST /api/chat/message
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ orchestrator.js — orchestrateChat                            │
│                                                              │
│  Fase 0 (parallelo):                                          │
│   • guardrail.checkInput(messageText)                        │
│   • memory.getHistory(sessionId)                             │
│   • database.getDemo(demoId)                                 │
│   • buildApiUserContent(message, attachment)                 │
│                                                              │
│  Fase 1 — se guardrail.blocked → chunk(refusal) + done       │
│  Fase 2 — router.route({demo}) → availableTools              │
│  Fase 3 — copywriter.streamTurn(messages, tools, onChunk)     │
│                │                                             │
│                ├─ finish_reason != tool_calls                │
│                │     → testo finale, done (no retrieval)     │
│                │                                             │
│                └─ finish_reason == tool_calls                │
│                      → toolExecutor.execute(toolCalls, {demo})│
│                           (search_configured_sites ▸ rag-agent│
│                            + search_websites / sms / email /  │
│                            tts / generate_document)           │
│                      → copywriter.streamTurn(2a chiamata)     │
│                      → qa.review (solo se grounded)          │
│                      → done (citations, confidence, attachment)│
└─────────────────────────────────────────────────────────────┘
        │  SSE: {type:'chunk',text} … {type:'done',…}
        ▼
   widget chat (costruisce il testo solo dagli eventi chunk)
```

#### Dettaglio per fase

1. **Fase 0 — attività indipendenti (parallele)**: in un singolo `Promise.all` l'orchestratore esegue il controllo input del guardrail, recupera la history dalla memoria, carica il demo dal database-agent e costruisce il contenuto utente multimodale (immagine → vision data-url, documento → testo estratto).
2. **System prompt**: `buildSystemPrompt(product, instructions)` + append di `demo.instructions`. L'allegato (se presente) aggiunge una nota di sistema che autorizza il modello a usare il contenuto allegato.
3. **Fase 1 — Guardrail input**: se `checkInput` rileva pattern di injection/jailbreak (`ignore previous instructions`, `reveal system prompt`, …) emette un `chunk` con il testo di rifiuto e il `done`, poi termina. Il rifiuto passa sempre via `chunk` perché il widget mostra solo gli eventi `chunk`.
4. **Fase 2 — Routing tool**: `router.route({ demo })` restituisce i tool disponibili. Se il demo ha una `knowledgeBaseId`, `search_configured_sites` è abilitato e `search_websites` escluso (e viceversa).
5. **Fase 3a — Prima chiamata copywriter**: streaming di `gpt-4o-mini` con gli `availableTools`. Ogni `delta.content` è inoltrato al widget come `chunk`. Se il modello non richiede tool → `done` con la sola risposta.
6. **Fase 3b — Esecuzione tool (parallela)**: se ci sono `tool_calls`, `toolExecutor.execute` li esegue in `Promise.all` (invece del `for` sequenziale originale). `search_configured_sites` delega al `rag-agent`:
   - Il `rag-agent` chiama prima `queryPlanner.plan(query)` (riscrittura eventuale).
   - Poi `rag.retrieve(plannedQuery, kbId, { k: 10 })` su LanceDB.
   - Deduplica le citazioni per URL (mantiene lo `score` più alto) e calcola `confidence = max(scores)`.
   - Se la KB manca/è vuota, ritorna un messaggio di "in costruzione" (`empty: true`) — **nessun fallback di lettura URL diretta**.
7. **Fase 3c — Seconda chiamata copywriter**: il contesto estratto + i `toolResults` vengono rimandati al modello, che genera la risposta finale in streaming. Se è stato generato un documento (`bufferOnly`), l'output viene sanificato dal `guardrail.checkOutput` (rimuove link `sandbox:` finti) e inviato in un unico `chunk` anziché in streaming.
8. **Fase 3d — QA advisory**: solo se il turno è *grounded* (`retrieval.empty === false`), `qa.review` valuta la risposta rispetto al contesto e può correggere la `confidence` finale (timeout 400ms; in caso di timeout/errore si mantiene la confidence euristica del rag-agent).
9. **Fase 3e — Risposta**: `buildChatResponse` assembla `done` con `{response, sessionId, citations, confidence, lowConfidence, attachment}` e l'orchestratore lo emette. La history viene aggiornata (`memory.append`) con il testo finale.

### Flusso utilizzo (caricamento demo)

1. L'utente apre `/demo.html?id=<demoId>`.
2. `demo.html` chiama `GET /api/demos/<demoId>` → ottiene `{ ...demo, knowledge: deriveKnowledgeStatus(demo.knowledgeBaseId) }`.
3. Carica l'iframe con `clientUrl` e inizializza il widget chat con `demoId`.
4. Ogni messaggio utente va a `POST /api/chat/message` → `chatService.handleChat()` → `orchestrateChat()` (vedi sopra). Il retrieval vettoriale sottostante (`src/pipeline/rag.js` → `rag.retrieve`):
   - Apre la tabella LanceDB `data/lancedb/<kbId>/documents`.
   - Riscrive la query con `query-planner-agent` (solo se lunga).
   - Embed della query con `text-embedding-3-small` (cache + throttle).
   - Ricerca vettoriale cosine su LanceDB (`ef=50`, `limit=50` per poi rerankare).
   - Dedup chunk per hash, rerank (`base_score` + boost keyword/length − penalty navigazione), top 10, contesto max 16k caratteri.
   - Restituisce `{ context, meta: [{title, url, score}], rewritten, empty }`, poi aggregato dal rag-agent in `citations` + `confidence`.
5. Le citazioni (URL cliccabili con score) e l'attachment eventale vengono inclusi nell'evento `done` e renderizzati dal widget.

---

## Dove viene salvato il dato (Percorsi filesystem)

```
C:\Users\demar\Downloads\ingestion-redesign\
├── demos.json                              ← Metadati demo (demoId, kbId, urls, colors, instructions)
├── users.json                              ← Utenti e credenziali
├── data/
│   ├── knowledge-engine/
│   │   ├── jobs.sqlite                     ← Registro globale job (status, owner, heartbeat, stats)
│   │   └── jobs/
│   │       └── <kbId>.sqlite               ← Stato per-job: frontier URL, pagine fetch ate, contatori
│   ├── lancedb/
│   │   └── <kbId>/
│   │       └── documents                   ← Tabella LanceDB vettoriale (index HNSW-PQ)
│   └── uploads/                            ← Allegati caricati in chat (immagini, PDF)
├── src/
│   ├── knowledge-engine/                   ← Motore di knowledge (crawler, ingest, chunking, embedding)
│   ├── orchestrator.js                     ← Coordina i micro-agenti per turno di chat (1 modello)
│   ├── agents/                             ← I 9 micro-agenti specializzati
│   │   ├── memory-agent.js                 ← Storico conversazioni per sessione
│   │   ├── database-agent.js               ← Lettura dati demo (getDemoById)
│   │   ├── router-agent.js                 ← Selezione tool disponibili per turno
│   │   ├── query-planner-agent.js          ← Riscrive la query di retrieval
│   │   ├── rag-agent.js                    ← Retrieval + citazioni + confidence
│   │   ├── guardrail-agent.js              ← Controlli anti-injection / sanificazione output
│   │   ├── tool-executor-agent.js          ← Esecuzione tool_calls (parallela)
│   │   ├── copywriter-agent.js             ← Streaming gpt-4o-mini (testo + tool_calls)
│   │   └── qa-agent.js                     ← Verifica quality advisory (confidence)
│   ├── pipeline/rag.js                     ← Retrieval vettoriale (usato dal rag-agent)
│   ├── services/chat-service.js            ← Adapter HTTP → orchestrateChat
│   └── lib/
│       ├── storage.js                      ← loadDemo / saveDemos wrapper
│       ├── knowledge-status.js             ← deriveKnowledgeStatus
│       ├── lancedb.js                      ← Helper connessione/apertura LanceDB
│       └── embeddings.js                   ← Embedder OpenAI condiviso
└── server.js                               ← Express: API routes, SSE, session, auth
```

### Riepilogo per ogni componente

| Dato | Dove | Come viene scritto |
|---|---|---|
| Lista demo + config | `demos.json` | `saveDemos()` in `POST /api/demos` |
| Job globale | `data/knowledge-engine/jobs.sqlite` | `jobsDb.upsertQueued()`, `setStatus()`, `setStats()` |
| Frontier URL + pagine | `data/knowledge-engine/jobs/<kbId>.sqlite` | `CrawlDb.upsertPage()`, `enqueueMany()`, `markUrlFetched()` |
| Vettori chunk | `data/lancedb/<kbId>/documents` | `vectorStore.insertChunks()` |
| Allegati chat | `data/uploads/` | `upload.single('file')` multer |

---

## Garantia di durabilità e ripristino

1. **Crash-safe**: ogni pagina fetch a viene persa in SQLite prima di qualsiasi valutazione. Se il processo muore, i lease scaduti vengono recuperati al riavvio.
2. **Idempotenza**: lo stesso `kbId` può essere re-inviato a `enqueueJob()` — il job manager riprende da dove si era interrotto (nessuna pagina re-fetchata, nessun vettore duplicato).
3. **Multi-process safe**: il `jobsDb` usa `claimQueued` atomico per assegnare un job a un solo processo alla volta. L'heartbeat (ogni 3s) prova che il proprietario è vivo.
4. **Niente stato in-memory condiviso tra restart**: il crawler vecchio perdeva tutto perché teneva `VISITED` e `URL_QUEUE` in variabili modulo. Il nuovo design persiste ogni stato su SQLite/LanceDB.

---

## Schema delle chiamate API rilevanti

| Metodo | Endpoint | Descrizione |
|---|---|---|
| `POST` | `/api/demos` | Crea demo + avvia ingestion job |
| `GET` | `/api/demos` | Lista demo dell'utente corrente |
| `GET` | `/api/demos/:id` | Dettaglio demo + knowledge status |
| `POST` | `/api/demos/:id/suggestions` | Suggerimenti di domande per il widget |
| `POST` | `/api/validate-url` | Validazione formato + raggiungibilità URL |
| `GET` | `/api/ingestion/:kbId/state` | Snapshot stato ingestion (polling) |
| `GET` | `/api/ingestion/:kbId/progress` | SSE streaming stato ingestion |
| `POST` | `/api/chat/message` | Invia messaggio chat → orchestratore micro-agenti (gpt-4o-mini + 9 agenti) + RAG retrieval |
| `POST` | `/api/chat/upload` | Upload allegato (immagine/documento) |
| `POST` | `/api/chat/tts` | Text-to-speech |
| `POST` | `/api/chat/clear` | Cancella sessione chat |

---

## Note tecniche rilevanti

- **Backend di risposta = 1 modello + micro-agenti**: `orchestrateChat` (`src/orchestrator.js`) pilota un singolo modello `gpt-4o-mini` (il *copywriter*) supportato da 9 micro-agenti in `src/agents/`. La logica prima inline in `chat-service.js#handleChat` è stata suddivisa per responsabilità (memoria, persistenza, routing, planning query, retrieval, guardrail, esecuzione tool, copywriting, QA). Il contratto SSE verso il widget è invariato.
- **Esecuzione tool parallela**: `tool-executor-agent` esegue i `tool_calls` di un turno in `Promise.all` (latenza ~`max()` invece di `sum()`), mantenendo l'ordine originale delle `toolCalls` per determinismo.
- **QA advisory-only**: `qa-agent` corregge solo la `confidence`/`lowConfidence` dell'evento `done`; non blocca né rigenera (lo streaming è già mostrato). Timeout 400ms, silent-fallback alla confidence euristica del rag-agent.
- **Guardrail non bloccante**: `guardrail-agent` usa regex conservative anti-injection (bias verso non-bloccare) e sanifica gli allegati solo quando il testo è già bufferizzato (es. dopo `generate_document`).
- **Concorrenza**: Max 2 job simultanei (`MAX_CONCURRENT_JOBS`), max 8 fetch in-flight, max 3 per host, max 3 ingest in-flight.
- **OpenAI embedding model**: `text-embedding-3-small`, `1536` dimensioni, cache LRU da 500 entry, throttle 1200ms tra batch.
- **Chat model**: `gpt-4o-mini` per le risposte (copywriter-agent), per il query rewrite (query-planner-agent) e per la verifica QA.
- **Database vettoriale**: LanceDB con indice HNSW-PQ cosine, attivato solo sopra 256 vettori.
- **Chunking**: tiktoken encoder per `text-embedding-3-small`, chunk target 1000 token, overlap 150.
- **Fetcher**: HTTP-first (più veloce, meno anti-bot), Puppeteer fallback per siti JS-rendered.
- **Robots.txt**: cache per-host nel CrawlDb, rispettato per tutti gli URL non-seed. I seed vengono crawltati comunque.
