// =============================================================================
// Server pre Automatickú analýzu online pohovorov s SQLite databázou
// Bakalárska práca - FIIT STU Bratislava
// Jakub Chmura
// =============================================================================

const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Načítanie databázového modulu
const dbModule = require('../database/db');

// Inicializácia DB schémy a seed admin účtu
dbModule.initDatabase();

const PORT = parseInt(process.env.PORT || '45681');

// Cesty k SSL certifikátom (Caddy na VPS)
const SSL_KEY_PATH = 'C:/ProgramData/caddy/storage/certificates/local/85.239.155.67/85.239.155.67.key';
const SSL_CERT_PATH = 'C:/ProgramData/caddy/storage/certificates/local/85.239.155.67/85.239.155.67.crt';

// MIME typy pre statické súbory
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// Jednoduché in-memory úložisko aktívnych auth session tokenov
const activeSessions = new Map();

// SSE (Server-Sent Events) aktívni klienti pre real-time DB zmeny
const sseClients = new Set();

dbModule.dbEvents.on('change', eventData => {
  const payload = `data: ${JSON.stringify(eventData)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
});

// =============================================================================
// Pomocné funkcie pre Request & Response
// =============================================================================

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        // limit 5MB
        reject(new Error('Payload príliš veľký'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Neplatný JSON formát'));
      }
    });
    req.on('error', reject);
  });
}

function getAuthUser(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  // Získanie používateľa z 30-dňovej perzistentnej session v SQLite databáze
  return dbModule.getSessionUser(token);
}

function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const segments = [];
  for (let i = 0; i < 3; i++) {
    let seg = '';
    for (let j = 0; j < 4; j++) {
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    segments.push(seg);
  }
  return 'bp-' + segments.join('-');
}

// =============================================================================
// Hlavný request handler
// =============================================================================

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // CORS podpora
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  try {
    // ---- REAL-TIME SSE STREAM ----
    if (pathname === '/api/db/stream' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(': stream pripojený\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // ---- AUTENTIFIKÁCIA ----
    // POST /api/auth/login
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const { username, password } = await parseJsonBody(req);
      if (!username || !password) {
        return sendJson(res, 400, { error: 'Zadajte používateľské meno a heslo.' });
      }

      const user = dbModule.authenticateUser(username, password);
      if (!user) {
        return sendJson(res, 401, { error: 'Nesprávne používateľské meno alebo heslo.' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      // Uloženie trvalej prihlasovacej session na 30 dní do databázy
      const expiresAt = dbModule.createSession(user.id, token, 30);

      return sendJson(res, 200, {
        ok: true,
        token,
        user,
        expiresAt,
      });
    }

    // GET /api/auth/me
    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const user = getAuthUser(req);
      if (!user) {
        return sendJson(res, 401, { error: 'Neprihlásený používateľ alebo relácia vypršala.' });
      }
      return sendJson(res, 200, { ok: true, user });
    }

    // POST /api/auth/logout
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const authHeader = req.headers['authorization'];
      if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        dbModule.deleteSession(token);
      }
      return sendJson(res, 200, { ok: true });
    }

    // ---- LIVE DATABASE INSPECTOR API ----
    // GET /api/db/live - Vráti kompletný stav celej DB pre vizuálny prehliadač
    if (pathname === '/api/db/live' && req.method === 'GET') {
      const snapshot = dbModule.getLiveDatabaseSnapshot();
      return sendJson(res, 200, snapshot);
    }

    // ---- POUŽÍVATELIA (users) ----
    // GET /api/users - Zoznam používateľov
    if (pathname === '/api/users' && req.method === 'GET') {
      const users = dbModule.getAllUsers();
      return sendJson(res, 200, users);
    }

    // POST /api/users - Vytvorenie nového HR alebo Superadmina
    if (pathname === '/api/users' && req.method === 'POST') {
      const caller = getAuthUser(req) || { username: 'admin' };
      const body = await parseJsonBody(req);
      try {
        const newUser = dbModule.createUser(body, caller.username);
        return sendJson(res, 201, { ok: true, user: newUser });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // DELETE /api/users/:id - Odstránenie používateľa (len pre Superadmina)
    if (pathname.startsWith('/api/users/') && req.method === 'DELETE') {
      const caller = getAuthUser(req);
      if (!caller) {
        return sendJson(res, 401, { error: 'Pre zmazanie používateľa musíte byť prihlásený.' });
      }
      if (caller.ures_tag !== 'SUPERADMIN') {
        return sendJson(res, 403, { error: 'Iba používateľ s rolou SUPERADMIN má právo odstrániť iného používateľa!' });
      }
      const userId = parseInt(pathname.split('/api/users/')[1]);
      try {
        dbModule.deleteUser(userId, caller.username);
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // ---- HR ADMINI (hr_admin) ----
    // GET /api/hr-admins
    if (pathname === '/api/hr-admins' && req.method === 'GET') {
      const hrList = dbModule.getAllHrAdmins();
      return sendJson(res, 200, hrList);
    }

    // ---- VYHODNOTENIE ENUM (vyhodnotenie) ----
    // GET /api/vyhodnotenia
    if (pathname === '/api/vyhodnotenia' && req.method === 'GET') {
      const list = dbModule.getAllVyhodnotenia();
      return sendJson(res, 200, list);
    }

    // ---- POHOVORY (interview & meetings) ----
    // GET /api/interviews alebo /api/meetings
    if ((pathname === '/api/interviews' || pathname === '/api/meetings') && req.method === 'GET') {
      const list = dbModule.getAllInterviews();
      const mapped = list.map(item => ({
        ...item,
        title: item.titul_pozicia,
        hrName: item.meno_hr,
        meetingUrl: item.link_meeting,
        createdAt: item.created_at,
      }));
      return sendJson(res, 200, mapped);
    }

    // POST /api/interviews alebo /api/meetings - Vytvoriť pohovor
    if ((pathname === '/api/interviews' || pathname === '/api/meetings') && req.method === 'POST') {
      const caller = getAuthUser(req) || { username: 'admin' };
      const body = await parseJsonBody(req);

      const roomId = body.roomId || body.room_id || generateRoomId();
      const protocol = isHttps ? 'https' : 'http';
      const host = req.headers.host || `85.239.155.67:${PORT}`;
      const link_meeting = body.link_meeting || `${protocol}://${host}/meeting/${roomId}`;

      // Zistenie HR ID
      let hr_id = body.hr_id;
      if (!hr_id) {
        const allUsers = dbModule.getAllUsers();
        if (body.hrName) {
          const found = allUsers.find(
            u => `${u.meno} ${u.priezvisko}`.toLowerCase().includes(body.hrName.toLowerCase()) ||
                 u.username.toLowerCase() === body.hrName.toLowerCase()
          );
          hr_id = found ? found.id : allUsers[0]?.id || 1;
        } else {
          hr_id = allUsers[0]?.id || 1;
        }
      }

      const datum = body.datum || new Date().toISOString().replace('T', ' ').substring(0, 16);
      const meno_respondenta = body.meno_respondenta || body.respondentName || 'Uchádzač';
      const mail_respondenta = body.mail_respondenta || body.respondentEmail || 'uchadzac@example.com';
      const titul_pozicia = body.titul_pozicia || body.title || 'Pohovor';
      const vyhodnotenie = body.vyhodnotenie || 'neprebehlo';
      const poznamky = body.poznamky || '';

      try {
        const interview = dbModule.createInterview(
          {
            datum,
            hr_id,
            meno_respondenta,
            mail_respondenta,
            link_meeting,
            room_id: roomId,
            titul_pozicia,
            vyhodnotenie,
            poznamky,
          },
          caller.username
        );

        return sendJson(res, 201, {
          ...interview,
          roomId: interview.room_id,
          title: interview.titul_pozicia,
          hrName: interview.meno_hr,
          meetingUrl: interview.link_meeting,
          createdAt: interview.created_at,
        });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // PATCH /api/interviews/:id/vyhodnotenie - Zmena statusu vyhodnotenia
    if (pathname.match(/^\/api\/interviews\/\d+\/vyhodnotenie$/) && req.method === 'PATCH') {
      const caller = getAuthUser(req) || { username: 'admin' };
      const id = parseInt(pathname.split('/api/interviews/')[1].split('/')[0]);
      const { vyhodnotenie } = await parseJsonBody(req);
      try {
        dbModule.updateInterviewEvaluation(id, vyhodnotenie, caller.username);
        return sendJson(res, 200, { ok: true, id, vyhodnotenie });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // DELETE /api/interviews/:id alebo /api/meetings/:id
    if (
      (pathname.startsWith('/api/interviews/') || pathname.startsWith('/api/meetings/')) &&
      req.method === 'DELETE'
    ) {
      const caller = getAuthUser(req) || { username: 'admin' };
      const rawId = pathname.replace(/^\/api\/(interviews|meetings)\//, '');
      const numId = parseInt(rawId);
      const targetId = isNaN(numId) ? rawId : numId;

      dbModule.deleteInterview(targetId, caller.username);
      return sendJson(res, 200, { ok: true });
    }

    // ---- STRÁNKY ----

    // Meeting stránka: /meeting/:roomId
    if (pathname.startsWith('/meeting/')) {
      const roomId = pathname.split('/meeting/')[1];
      if (roomId) {
        const existing = dbModule.getInterviewByRoomId(roomId);
        if (!existing) {
          const adminUser = dbModule.getAllUsers()[0];
          const protocol = isHttps ? 'https' : 'http';
          const host = req.headers.host || `85.239.155.67:${PORT}`;
          const link_meeting = `${protocol}://${host}/meeting/${roomId}`;
          try {
            dbModule.createInterview(
              {
                datum: new Date().toISOString().replace('T', ' ').substring(0, 16),
                hr_id: adminUser.id,
                meno_respondenta: 'Kandidát',
                mail_respondenta: 'kandidat@example.com',
                link_meeting,
                room_id: roomId,
                titul_pozicia: 'Priamy pohovor',
                vyhodnotenie: 'rozpracovane',
                poznamky: 'Vytvorené priamym vstupom cez link',
              },
              'SYSTEM'
            );
          } catch (e) {
            // Ignorujeme, ak už bol medzitým vytvorený
          }
        }
      }
      return serveFile(res, path.join(__dirname, 'meeting.html'));
    }

    // Admin panel: /admin
    if (pathname === '/admin' || pathname === '/admin/') {
      return serveFile(res, path.join(__dirname, 'admin.html'));
    }

    // Hlavná stránka (landing)
    if (pathname === '/' || pathname === '/index.html') {
      return serveFile(res, path.join(__dirname, 'index.html'));
    }

    // Statické súbory
    const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(__dirname, safePath);

    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    serveFile(res, filePath);
  } catch (err) {
    console.error('Chyba požiadavky:', err);
    sendJson(res, 500, { error: 'Interná chyba servera: ' + err.message });
  }
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;">
        <h2>404 - Stránka nenájdená</h2>
        <p><a href="/">Späť na hlavnú stránku</a></p>
        </body></html>
      `);
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// =============================================================================
// Spustenie servera
// =============================================================================

let server;
let isHttps = false;

if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
  const options = {
    key: fs.readFileSync(SSL_KEY_PATH),
    cert: fs.readFileSync(SSL_CERT_PATH),
  };
  server = https.createServer(options, handleRequest);
  isHttps = true;

  server.on('clientError', (err, socket) => {
    if (err.code === 'ERR_SSL_HTTP_REQUEST' || (err.message && err.message.includes('http request'))) {
      const redirectUrl = `https://85.239.155.67:${PORT}/`;
      socket.end(
        'HTTP/1.1 301 Moved Permanently\r\n' +
        `Location: ${redirectUrl}\r\n` +
        'Connection: close\r\n\r\n'
      );
      return;
    }
    socket.destroy(err);
  });
} else {
  server = http.createServer(handleRequest);
  console.log('⚠️  SSL certifikáty nenájdené, server beží v HTTP móde');
}

server.listen(PORT, '0.0.0.0', () => {
  const protocol = isHttps ? 'https' : 'http';
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Analýza Online Pohovorov - Server & SQLite DB           ║
║  ${protocol}://0.0.0.0:${PORT}                                  ║
║                                                          ║
║  Stránky:                                                ║
║    /           - Hlavná stránka                          ║
║    /admin      - HR Konzola s prihlásením & Live DB       ║
║    /meeting/:id - Meeting stránka s Jitsi + eye-tracking ║
║                                                          ║
║  Databáza:                                               ║
║    Umiestnenie: ../database/pohovory.db                  ║
║    Predvolený účet: admin / admin (SUPERADMIN)           ║
╚══════════════════════════════════════════════════════════╝
  `);
});
