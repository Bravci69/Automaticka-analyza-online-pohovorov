// =============================================================================
// Server pre Automatickú analýzu online pohovorov
// Bakalárska práca - FIIT STU Bratislava
// Jakub Chmura
// =============================================================================

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

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

// Jednoduchá in-memory databáza meetingov (pre demo)
const meetings = new Map();

// =============================================================================
// Hlavný request handler
// =============================================================================
function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS pre API volania
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // ---- API ENDPOINTS ----

  // POST /api/meetings - Vytvoriť nový meeting
  if (pathname === '/api/meetings' && req.method === 'POST') {
    return handleCreateMeeting(req, res);
  }

  // GET /api/meetings - Zoznam meetingov
  if (pathname === '/api/meetings' && req.method === 'GET') {
    return handleListMeetings(req, res);
  }

  // DELETE /api/meetings/:id
  if (pathname.startsWith('/api/meetings/') && req.method === 'DELETE') {
    const id = pathname.split('/api/meetings/')[1];
    meetings.delete(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // ---- STRÁNKY ----

  // Meeting stránka: /meeting/:roomId
  if (pathname.startsWith('/meeting/')) {
    return serveFile(res, path.join(__dirname, 'meeting.html'));
  }

  // Admin panel
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

  // Bezpečnostná kontrola - nesmie ísť mimo __dirname
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  serveFile(res, filePath);
}

// =============================================================================
// API Handlers
// =============================================================================
function handleCreateMeeting(req, res) {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      const roomId = data.roomId || generateRoomId();
      const title = data.title || 'Pohovor';
      const hrName = data.hrName || 'HR';

      const protocol = isHttps ? 'https' : 'http';
      const host = req.headers.host || `85.239.155.67:${PORT}`;
      const meetingUrl = `${protocol}://${host}/meeting/${roomId}`;

      const meeting = {
        roomId,
        title,
        hrName,
        meetingUrl,
        createdAt: new Date().toISOString(),
      };

      meetings.set(roomId, meeting);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(meeting));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Neplatné dáta' }));
    }
  });
}

function handleListMeetings(req, res) {
  const list = Array.from(meetings.values()).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(list));
}

// =============================================================================
// Pomocné funkcie
// =============================================================================
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

  // HTTP na HTTPS presmerovanie
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
║  Analýza Online Pohovorov - Server                      ║
║  ${protocol}://0.0.0.0:${PORT}                                  ║
║                                                          ║
║  Stránky:                                                ║
║    /           - Hlavná stránka                          ║
║    /admin      - Admin panel (vytváranie meetingov)       ║
║    /meeting/:id - Meeting stránka s Jitsi + eye-tracking ║
╚══════════════════════════════════════════════════════════╝
  `);
});
