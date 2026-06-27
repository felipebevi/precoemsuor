// ─────────────────────────────────────────────────────────────────────────
//  coleta_apk — micro-servidor pros eventos do APK de leitura de placas.
//  Recebe POST e acumula em JSONL local. GET devolve tudo + limpa.
//  Sem deps externas (node http puro). Persistência via volume Docker /data.
// ─────────────────────────────────────────────────────────────────────────
const http = require('http');
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data';
const STORE    = path.join(DATA_DIR, 'coletas.jsonl');
const PORT     = process.env.PORT || 3000;
const MAX_BODY = 256 * 1024;       // 256 KB por requisição (bem mais do que precisa)

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > MAX_BODY) { req.destroy(); reject(new Error('payload too large')); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (res, status, obj) => {
  res.writeHead(status, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  try {
    // POST /coleta_apk — append no JSONL
    if (req.url === '/coleta_apk' && req.method === 'POST') {
      let body;
      try { body = await readBody(req); } catch (e) { return json(res, 413, { error: 'payload too large' }); }
      let payload;
      try { payload = JSON.parse(body); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      const enriched = {
        ...payload,
        _receivedAt: new Date().toISOString(),
        _ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
      };
      fs.appendFileSync(STORE, JSON.stringify(enriched) + '\n');
      return json(res, 200, { ok: true, receivedAt: enriched._receivedAt });
    }

    // GET /coleta_apk_coleta — devolve tudo e LIMPA (atomic rename pra evitar race)
    if (req.url === '/coleta_apk_coleta' && req.method === 'GET') {
      let coletas = [];
      if (fs.existsSync(STORE)) {
        const tmp = STORE + '.reading-' + Date.now();
        try { fs.renameSync(STORE, tmp); } catch (e) { /* permissão; abort */ return json(res, 500, { error: 'cannot rotate' }); }
        const content = fs.readFileSync(tmp, 'utf8');
        coletas = content.split('\n').filter(Boolean).map(l => {
          try { return JSON.parse(l); } catch { return { raw: l }; }
        });
        try { fs.unlinkSync(tmp); } catch {}
      }
      return json(res, 200, { count: coletas.length, coletas });
    }

    // GET /coleta_apk (healthcheck/contagem sem limpar)
    if (req.url === '/coleta_apk' && req.method === 'GET') {
      let count = 0;
      if (fs.existsSync(STORE)) {
        try {
          const content = fs.readFileSync(STORE, 'utf8');
          count = content.split('\n').filter(Boolean).length;
        } catch {}
      }
      return json(res, 200, { service: 'coleta_apk', pending: count });
    }

    json(res, 404, { error: 'not found', url: req.url });
  } catch (e) {
    console.error('erro', e);
    json(res, 500, { error: 'internal' });
  }
});

server.listen(PORT, () => console.log('coleta_apk listening on', PORT, 'store:', STORE));
