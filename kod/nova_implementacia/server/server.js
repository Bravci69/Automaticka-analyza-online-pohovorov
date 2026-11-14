// =============================================================================
// Server pre Automatickú analýzu online pohovorov s SQLite databázou
// Bakalárska práca - FIIT STU Bratislava
// Jakub Chmura
// =============================================================================

const https = require('node:https');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Načítanie databázového modulu
const dbModule = require('../database/db');

// Načítanie emailového a plánovacieho modulu
const mailer = require('./mailer');
const reminderCron = require('./reminder_cron');

// Inicializácia DB schémy a seed admin účtu
dbModule.initDatabase();

// Načítanie konfigurácie z config.json
let loadedConfigPath = null;
function loadConfig() {
  const possiblePaths = [
    path.join(__dirname, 'config.json'),
    path.join(__dirname, '..', 'config.json'),
    path.join(process.cwd(), 'config.json'),
    path.join(process.cwd(), 'kod/nova_implementacia/server/config.json'),
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        loadedConfigPath = p;
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (_) {}
  }
  return {};
}

const config = loadConfig();
const HOST = config.host || process.env.HOST || 'host2.fxcomputers.net';
const PORT = parseInt(config.port || process.env.PORT || 13191, 10);
console.log(`[Config] Konfigurácia načítaná z: ${loadedConfigPath || 'predvolené'}`);
console.log(`[Config] HOST: ${HOST}, PORT: ${PORT}`);

// Cesty k SSL certifikátom (vlastné certifikáty v priečinku ssl/ alebo Caddy)
const localKeyPath = path.join(__dirname, 'ssl', 'server.key');
const localCertPath = path.join(__dirname, 'ssl', 'server.crt');
const configKeyPath = config.ssl?.key ? (path.isAbsolute(config.ssl.key) ? config.ssl.key : path.join(__dirname, config.ssl.key)) : null;
const configCertPath = config.ssl?.cert ? (path.isAbsolute(config.ssl.cert) ? config.ssl.cert : path.join(__dirname, config.ssl.cert)) : null;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || (configKeyPath && fs.existsSync(configKeyPath) ? configKeyPath : (fs.existsSync(localKeyPath) ? localKeyPath : `C:/ProgramData/caddy/storage/certificates/local/${HOST}/${HOST}.key`));
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || (configCertPath && fs.existsSync(configCertPath) ? configCertPath : (fs.existsSync(localCertPath) ? localCertPath : `C:/ProgramData/caddy/storage/certificates/local/${HOST}/${HOST}.crt`));

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

    // POST /api/users - Vytvorenie nového HR alebo Superadmina (len pre Superadmina)
    if (pathname === '/api/users' && req.method === 'POST') {
      const caller = getAuthUser(req);
      if (!caller) {
        return sendJson(res, 401, { error: 'Pre vytvorenie používateľa musíte byť prihlásený.' });
      }
      if (caller.ures_tag !== 'SUPERADMIN') {
        return sendJson(res, 403, { error: 'Iba používateľ s rolou SUPERADMIN má právo vytvárať nových používateľov!' });
      }
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
      const caller = getAuthUser(req);
      const mine = url.searchParams.get('mine');
      const hrIdParam = url.searchParams.get('hr_id');

      let list;
      if (mine === '1' || mine === 'true') {
        list = caller ? dbModule.getInterviewsByHr(caller.id) : [];
      } else if (hrIdParam) {
        list = dbModule.getInterviewsByHr(parseInt(hrIdParam));
      } else {
        list = dbModule.getAllInterviews();
      }

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
      const caller = getAuthUser(req) || { username: 'admin', ures_tag: 'SUPERADMIN', id: 1 };
      const body = await parseJsonBody(req);

      const roomId = body.roomId || body.room_id || generateRoomId();
      const protocol = isHttps ? 'https' : 'http';
      const host = req.headers.host || `${HOST}:${PORT}`;
      const link_meeting = body.link_meeting || `${protocol}://${host}/meeting/${roomId}`;

      // PRIRAĎOVANIE HR:
      // Iba SUPERADMIN môže priraďovať, kto bude ako HR na pohovore.
      // HR admin si nemôže meniť kto tam bude, ale je nastavený automaticky na seba!
      let hr_id;
      if (caller.ures_tag === 'SUPERADMIN') {
        if (body.hr_id) {
          hr_id = parseInt(body.hr_id);
        } else {
          const allUsers = dbModule.getAllUsers();
          hr_id = allUsers[0]?.id || caller.id || 1;
        }
      } else {
        // Pre HR_ADMIN sa ignoruje akékoľvek poslané hr_id a nastaví sa automaticky na prihláseného HR
        hr_id = caller.id;
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

        // Automatické okamžité odoslanie e-mailovej pozvánky uchádzačovi pri naplánovaní pohovoru
        mailer.sendInterviewConfirmation(interview).catch(mailErr => {
          console.error('[Server] Chyba pri asynchrónnom odosielaní pozvánky:', mailErr);
        });

        return sendJson(res, 201, {
          ...interview,
          roomId: interview.room_id,
          title: interview.titul_pozicia,
          hrName: interview.meno_hr,
          meetingUrl: interview.link_meeting,
          createdAt: interview.created_at,
          invitation: interview.invitation,
        });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // GET /api/interviews/:id/invitation - Získanie detailu vygenerovanej pozvánky
    if (pathname.match(/^\/api\/interviews\/\d+\/invitation$/) && req.method === 'GET') {
      const id = parseInt(pathname.split('/api/interviews/')[1].split('/')[0]);
      const interview = dbModule.getInterviewById(id);
      if (!interview) {
        return sendJson(res, 404, { error: 'Pohovor s daným ID neexistuje.' });
      }
      const invitation = dbModule.generateInterviewInvitation(interview);
      return sendJson(res, 200, { ok: true, interview, invitation });
    }

    // GET /api/interviews/:id/ics - Stiahnutie iCalendar (.ics) súboru pre kalendár
    if (pathname.match(/^\/api\/interviews\/\d+\/ics$/) && req.method === 'GET') {
      const id = parseInt(pathname.split('/api/interviews/')[1].split('/')[0]);
      const interview = dbModule.getInterviewById(id);
      if (!interview) {
        return sendJson(res, 404, { error: 'Pohovor s daným ID neexistuje.' });
      }
      const ics = dbModule.generateIcsContent(interview);
      res.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="pohovor-${interview.room_id || id}.ics"`,
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(ics);
    }

    // POST /api/interviews/:id/resend-invitation - Opätovné odoslanie pozvánky uchádzačovi
    if (pathname.match(/^\/api\/interviews\/\d+\/resend-invitation$/) && req.method === 'POST') {
      const caller = getAuthUser(req) || { username: 'admin' };
      const id = parseInt(pathname.split('/api/interviews/')[1].split('/')[0]);
      const interview = dbModule.getInterviewById(id);
      if (!interview) {
        return sendJson(res, 404, { error: 'Pohovor neexistuje.' });
      }
      const invitation = dbModule.generateInterviewInvitation(interview);
      
      // Skutočné odoslanie emailu cez SMTP
      const sendResult = await mailer.sendInterviewConfirmation(interview);

      return sendJson(res, 200, { 
        ok: true, 
        message: sendResult.ok ? 'Pozvánka bola úspešne odoslaná na e-mail uchádzača.' : `Pozvánka vygenerovaná, ale odoslanie zlyhalo: ${sendResult.error}`,
        invitation,
        emailSent: sendResult.ok,
        emailError: sendResult.error || null,
      });
    }

    // POST /api/interviews/:id/send-reminder - Manuálne odoslanie pripomienky na pohovor
    if (pathname.match(/^\/api\/interviews\/\d+\/send-reminder$/) && req.method === 'POST') {
      const caller = getAuthUser(req) || { username: 'admin' };
      const id = parseInt(pathname.split('/api/interviews/')[1].split('/')[0]);
      const interview = dbModule.getInterviewById(id);
      if (!interview) {
        return sendJson(res, 404, { error: 'Pohovor neexistuje.' });
      }

      const sendResult = await mailer.sendInterviewReminder(interview);
      if (sendResult.ok) {
        dbModule.markReminderSent(id, caller.username);
        return sendJson(res, 200, {
          ok: true,
          message: `Pripomienka na pohovor o ${sendResult.reminderTime} bola úspešne odoslaná na e-mail ${interview.mail_respondenta}.`,
          time: sendResult.reminderTime,
        });
      } else {
        return sendJson(res, 500, {
          ok: false,
          error: `Zlyhalo odoslanie pripomienky: ${sendResult.error}`,
        });
      }
    }

    // GET /api/email/status - Overenie stavu e-mailovej konfigurácie a SMTP
    if (pathname === '/api/email/status' && req.method === 'GET') {
      const cfg = mailer.getEmailConfig();
      const smtpVerify = await mailer.verifySmtp();
      return sendJson(res, 200, {
        ok: true,
        user: cfg.user,
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        smtp: smtpVerify,
      });
    }

    // POST /api/email/test - Odoslanie testovacieho emailu
    if (pathname === '/api/email/test' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const recipient = body.to || body.recipient;
      const testResult = await mailer.sendTestEmail(recipient);
      if (testResult.ok) {
        return sendJson(res, 200, { ok: true, message: `Testovací e-mail úspešne odoslaný na ${testResult.to}` });
      } else {
        return sendJson(res, 500, { ok: false, error: testResult.error });
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
          const host = req.headers.host || `${HOST}:${PORT}`;
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
  const httpsServer = https.createServer(options, handleRequest);
  isHttps = true;

  // HTTP fallback / redirect server: ak používateľ zadá http:// namiesto https://
  const httpServer = http.createServer((req, res) => {
    const rawHost = req.headers.host || HOST;
    const host = rawHost.split(':')[0];
    const target = `https://${host}:${PORT}${req.url}`;
    res.writeHead(302, {
      'Location': target,
      'Content-Type': 'text/html; charset=utf-8'
    });
    res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${target}"></head><body>Presmerovanie na zabezpečenú verziu: <a href="${target}">${target}</a></body></html>`);
  });

  // Inteligentný TCP multiplexer: deteguje TLS handshake (0x16) vs bežný HTTP request
  server = net.createServer(socket => {
    socket.on('error', () => {});
    socket.once('data', chunk => {
      if (!chunk || chunk.length === 0) return;
      socket.pause();
      socket.unshift(chunk);
      if (chunk[0] === 0x16) {
        httpsServer.emit('connection', socket);
      } else {
        httpServer.emit('connection', socket);
      }
      process.nextTick(() => socket.resume());
    });
  });
} else {
  server = http.createServer(handleRequest);
  console.log('⚠️  SSL certifikáty nenájdené, server beží v HTTP móde');
}

server.listen(PORT, '0.0.0.0', () => {
  const protocol = isHttps ? 'https' : 'http';
  const emailCfg = mailer.getEmailConfig();
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Analýza Online Pohovorov - Server & SQLite DB           ║
║  ${protocol}://0.0.0.0:${PORT}                                  ║
║  (Automatický redirect HTTP -> HTTPS aktívny)            ║
║                                                          ║
║  E-mail & Pripomienky:                                   ║
║    Odosielateľ: ${emailCfg.user.padEnd(41)}║
║    SMTP Server: ${(emailCfg.host + ':' + emailCfg.port).padEnd(41)}║
║    Pripomienky: Automatické (1 deň pred pohovorom)       ║
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

  // Spustenie automatického plánovača pripomienok (deň pred pohovorom)
  reminderCron.startReminderScheduler(60000);
});
