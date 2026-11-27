// =============================================================================
// Databázový modul: Analýza Online Pohovorov
// Bakalárska práca - FIIT STU Bratislava
// Jakub Chmura
// =============================================================================

const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const DB_DIR = __dirname;
const DB_PATH = path.join(DB_DIR, 'pohovory.db');
const SCHEMA_PATH = path.join(DB_DIR, 'schema.sql');

// Globálny emitter pre okamžité Real-Time zmeny
const dbEvents = new EventEmitter();

// Načítanie konfigurácie z config.json
function loadConfig() {
  const possiblePaths = [
    path.join(__dirname, '../server/config.json'),
    path.join(__dirname, 'config.json'),
    path.join(__dirname, '..', 'config.json'),
    path.join(process.cwd(), 'config.json'),
    path.join(process.cwd(), 'kod/nova_implementacia/server/config.json'),
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        return JSON.parse(content);
      }
    } catch (_) {}
  }
  return {};
}

const appConfig = loadConfig();
const APP_HOST = appConfig.host || process.env.HOST || 'host2.fxcomputers.net';
const APP_PORT = parseInt(appConfig.port || process.env.PORT || 13191, 10);

// Zabezpečenie existencie priečinka pre databázu
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Inicializácia pripojenia k SQLite databáze
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// =============================================================================
// KRYPTOGRAFICKÉ FUNKCIE (Heslá a Soľ)
// =============================================================================

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, storedHash, salt) {
  const calculatedHash = hashPassword(password, salt);
  return crypto.timingSafeEqual(
    Buffer.from(calculatedHash, 'hex'),
    Buffer.from(storedHash, 'hex')
  );
}

// =============================================================================
// INICIALIZÁCIA DATABÁZY A POČIATOČNÉ DÁTA (SEED)
// =============================================================================

function initDatabase() {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schemaSql);

  // Migrácia schémy pre podporu pripomienok (reminder_sent)
  try {
    db.exec('ALTER TABLE interview ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0;');
  } catch (_) {}
  try {
    db.exec('ALTER TABLE interview ADD COLUMN reminder_sent_at TEXT;');
  } catch (_) {}
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_interview_reminder ON interview(reminder_sent, datum);');
  } catch (_) {}

  // 1. Predvyplnenie enum hodnôt vyhodnotenia
  const enumValues = [
    {
      kod: 'rozpracovane',
      nazov: 'Rozpracované',
      farba: '#38bdf8',
      popis: 'Pohovor momentálne prebieha alebo sa spracúva analýza.',
    },
    {
      kod: 'neprebehlo',
      nazov: 'Neprebehlo',
      farba: '#94a3b8',
      popis: 'Pohovor je naplánovaný a čaká na začiatok.',
    },
    {
      kod: 'postupil',
      nazov: 'Postúpil',
      farba: '#10b981',
      popis: 'Kandidát úspešne splnil požiadavky a postupuje do ďalšieho kola.',
    },
    {
      kod: 'nepostupil',
      nazov: 'Nepostúpil',
      farba: '#ef4444',
      popis: 'Kandidát na základe vyhodnotenia nepostupuje.',
    },
    {
      kod: 'zruseny',
      nazov: 'Zrušený',
      farba: '#dc2626',
      popis: 'Pohovor bol zrušený HR konzultantom alebo administrátorom.',
    },
  ];

  const stmtEnum = db.prepare(`
    INSERT OR REPLACE INTO vyhodnotenie (kod, nazov, farba, popis)
    VALUES (?, ?, ?, ?)
  `);

  for (const item of enumValues) {
    stmtEnum.run(item.kod, item.nazov, item.farba, item.popis);
  }

  // 1b. Migrácia tabuľky interview pre stĺpec dalsie_maily (ďalší zamestnanci / teamleaderi)
  try {
    const interviewCols = db.prepare("PRAGMA table_info(interview)").all();
    if (!interviewCols.some(c => c.name === 'dalsie_maily')) {
      db.prepare("ALTER TABLE interview ADD COLUMN dalsie_maily TEXT").run();
      console.log('✅ Doplnený stĺpec dalsie_maily do tabuľky interview');
    }
  } catch (err) {
    console.error('Chyba kontroly stĺpca dalsie_maily:', err.message);
  }

  // 2. Kontrola a vytvorenie 1. používateľa: admin / admin (SUPERADMIN)
  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');

  if (!existingAdmin) {
    const salt = generateSalt();
    const hash = hashPassword('admin', salt);

    const userInsert = db.prepare(`
      INSERT INTO users (username, meno, priezvisko, mail, password_hash, password_salt, ures_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('admin', 'Admin', 'Systému', 'admin@fiit.stuba.sk', hash, salt, 'SUPERADMIN');

    const adminUserId = Number(userInsert.lastInsertRowid);

    // Záznam v hr_admin
    db.prepare(`
      INSERT OR REPLACE INTO hr_admin (user_id, pocet_interviews, datum_interview)
      VALUES (?, 0, NULL)
    `).run(adminUserId);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (akcia, autor, detaily)
      VALUES (?, ?, ?)
    `).run(
      'INICIALIZACIA',
      'SYSTEM',
      'Systém inicializovaný: Vytvorený hlavný účet "admin" s rolou SUPERADMIN.'
    );

    console.log('✅ Databáza inicializovaná. Vytvorený predvolený používateľ admin / admin');
  }

  // 2b. Kontrola a vytvorenie / aktualizácia superadmina: autworld (Jakub Chmura)
  const existingAutworld = db.prepare('SELECT id FROM users WHERE username = ?').get('autworld');
  if (!existingAutworld) {
    const salt = generateSalt();
    const hash = hashPassword('Captain99@', salt);

    const autInsert = db.prepare(`
      INSERT INTO users (username, meno, priezvisko, mail, password_hash, password_salt, ures_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('autworld', 'Jakub', 'Chmura', 'jakubchmura9@gmail.com', hash, salt, 'SUPERADMIN');

    const autUserId = Number(autInsert.lastInsertRowid);

    db.prepare(`
      INSERT OR REPLACE INTO hr_admin (user_id, pocet_interviews, datum_interview)
      VALUES (?, 0, NULL)
    `).run(autUserId);

    db.prepare(`
      INSERT INTO audit_logs (akcia, autor, detaily)
      VALUES (?, ?, ?)
    `).run(
      'INICIALIZACIA',
      'SYSTEM',
      'Vytvorený účet "autworld" (Jakub Chmura) s rolou SUPERADMIN.'
    );

    console.log('✅ Vytvorený superadmin používateľ autworld (Jakub Chmura) s heslom');
  } else {
    // Aktualizácia hesla a roly pre autworld na SUPERADMIN
    const salt = generateSalt();
    const hash = hashPassword('Captain99@', salt);
    db.prepare(`
      UPDATE users 
      SET meno = 'Jakub', priezvisko = 'Chmura', mail = COALESCE(mail, 'jakubchmura9@gmail.com'),
          password_hash = ?, password_salt = ?, ures_tag = 'SUPERADMIN'
      WHERE username = 'autworld'
    `).run(hash, salt);

    db.prepare(`
      INSERT OR IGNORE INTO hr_admin (user_id, pocet_interviews, datum_interview)
      VALUES (?, 0, NULL)
    `).run(existingAutworld.id);
  }

  // 3. Kontrola či existuje aspoň jeden ukážkový pohovor pre vizualizáciu
  const interviewCount = db.prepare('SELECT COUNT(*) AS cnt FROM interview').get().cnt;
  if (interviewCount === 0) {
    const adminUser = db.prepare('SELECT id, meno, priezvisko FROM users WHERE username = ?').get('admin');
    if (adminUser) {
      const sampleDatum = new Date(Date.now() + 24 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 16);
      const insertSample = db.prepare(`
        INSERT INTO interview (datum, hr_id, meno_hr, meno_respondenta, mail_respondenta, link_meeting, room_id, titul_pozicia, vyhodnotenie, poznamky)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sampleDatum,
        adminUser.id,
        `${adminUser.meno} ${adminUser.priezvisko}`,
        'Ján Ukážkový',
        'jan.ukazkovy@example.com',
        `https://${APP_HOST}:${APP_PORT}/meeting/bp-demo-pohovor`,
        'bp-demo-pohovor',
        'Frontend / AI Developer',
        'rozpracovane',
        'Ukážkový pohovor pre testovanie vyhodnocovacieho a eye-tracking systému.'
      );

      const sampleInterviewId = Number(insertSample.lastInsertRowid);

      db.prepare(`
        INSERT INTO interview_analyza (interview_id, skore_pozornosti, dominantna_emocia, pocet_vyplnovych_slov, stav_analyzy)
        VALUES (?, ?, ?, ?, ?)
      `).run(sampleInterviewId, 88.5, 'sústredená', 4, 'prebieha');

      updateHrInterviewStats(adminUser.id);
    }
  }
}

// =============================================================================
// SPÚŠŤANIE REAL-TIME NOTIFIKÁCIÍ
// =============================================================================

function notifyDbChange(action, details = {}) {
  dbEvents.emit('change', {
    timestamp: new Date().toISOString(),
    action,
    details,
  });
}

// =============================================================================
// OPERÁCIE S POUŽÍVATEĽMI (users)
// =============================================================================

function authenticateUser(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return null;

  const valid = verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) return null;

  logAudit('PRIHLASENIE', user.username, `Úspešné prihlásenie používateľa do HR konzoly`);

  return {
    id: user.id,
    username: user.username,
    meno: user.meno,
    priezvisko: user.priezvisko,
    mail: user.mail,
    ures_tag: user.ures_tag,
    created_at: user.created_at,
  };
}

function createUser({ username, meno, priezvisko, mail, password, ures_tag }, author = 'admin') {
  if (!username || !meno || !priezvisko || !mail || !password || !ures_tag) {
    throw new Error('Všetky polia sú povinné!');
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR mail = ?').get(username, mail);
  if (existing) {
    throw new Error('Používateľ s týmto menom alebo emailom už existuje!');
  }

  const salt = generateSalt();
  const hash = hashPassword(password, salt);

  const res = db.prepare(`
    INSERT INTO users (username, meno, priezvisko, mail, password_hash, password_salt, ures_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(username, meno, priezvisko, mail, hash, salt, ures_tag);

  const userId = Number(res.lastInsertRowid);

  // Vytvorenie záznamu v hr_admin pre každého nového používateľa (HR aj Superadmin)
  db.prepare(`
    INSERT INTO hr_admin (user_id, pocet_interviews, datum_interview)
    VALUES (?, 0, NULL)
  `).run(userId);

  logAudit(
    'VYTVORENIE_POUZIVATELA',
    author,
    `Vytvorený používateľ "${username}" (${meno} ${priezvisko}, rola: ${ures_tag})`
  );

  notifyDbChange('USER_CREATED', { userId, username, ures_tag });

  return {
    id: userId,
    username,
    meno,
    priezvisko,
    mail,
    ures_tag,
    created_at: new Date().toISOString(),
  };
}

function getAllUsers() {
  return db.prepare(`
    SELECT 
      u.id,
      u.username,
      u.meno,
      u.priezvisko,
      u.mail,
      u.password_hash,
      u.password_salt,
      u.ures_tag,
      u.created_at,
      ha.pocet_interviews,
      ha.datum_interview
    FROM users u
    LEFT JOIN hr_admin ha ON ha.user_id = u.id
    ORDER BY u.id ASC
  `).all();
}

function deleteUser(userId, author = 'admin') {
  const user = db.prepare('SELECT id, username, meno, priezvisko, ures_tag FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('Používateľ s daným ID neexistuje.');
  if (author === user.username) throw new Error('Nemôžete zmazať svoj vlastný účet, pod ktorým ste aktuálne prihlásený!');

  // Ak je mazaný používateľ SUPERADMIN, overíme, že v systéme zostane aspoň jeden iný aktívny SUPERADMIN
  if (user.ures_tag === 'SUPERADMIN') {
    const superadminCount = db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE ures_tag = 'SUPERADMIN'").get().cnt;
    if (superadminCount <= 1) {
      throw new Error('Nie je možné zmazať tohto administrátora! V databáze musí zostať aspoň jeden aktívny SUPERADMIN.');
    }
  }

  // Ak má daný používateľ priradené pohovory, prehodíme ich na autora (prihláseného superadmina)
  // alebo iného existujúceho superadmina, aby nedošlo k porušeniu integrity cudzích kľúčov
  let targetAdmin = db.prepare('SELECT id, meno, priezvisko FROM users WHERE username = ?').get(author);
  if (!targetAdmin || targetAdmin.id === userId) {
    targetAdmin = db.prepare("SELECT id, meno, priezvisko FROM users WHERE ures_tag = 'SUPERADMIN' AND id != ? LIMIT 1").get(userId);
  }

  if (targetAdmin) {
    db.prepare(`
      UPDATE interview 
      SET hr_id = ?, meno_hr = ? 
      WHERE hr_id = ?
    `).run(targetAdmin.id, `${targetAdmin.meno} ${targetAdmin.priezvisko}`, userId);
    updateHrInterviewStats(targetAdmin.id);
  }

  // Zmažeme používateľa (kaskádovo zmaže hr_admin aj sessions)
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  const actionName = user.ures_tag === 'SUPERADMIN' ? 'ZMAZANIE_SUPERADMINA' : 'ZMAZANIE_POUZIVATELA';
  logAudit(
    actionName,
    author,
    `Superadmin "${author}" odstránil používateľa "${user.username}" (${user.meno} ${user.priezvisko}, rola: ${user.ures_tag})`
  );
  notifyDbChange('USER_DELETED', { userId, username: user.username, role: user.ures_tag });
  return true;
}

// =============================================================================
// TRVALÉ PRIHLASOVACIE RELÁCIE NA 30 DNÍ (sessions)
// =============================================================================

function createSession(userId, token, days = 30) {
  // Vyčistenie starých expirovaných relácií
  try {
    db.prepare("DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now', 'localtime')").run();
  } catch (e) {}

  const expiresDate = new Date(Date.now() + days * 24 * 3600 * 1000);
  const pad = n => String(n).padStart(2, '0');
  const expiresAt = `${expiresDate.getFullYear()}-${pad(expiresDate.getMonth() + 1)}-${pad(expiresDate.getDate())} ${pad(expiresDate.getHours())}:${pad(expiresDate.getMinutes())}:${pad(expiresDate.getSeconds())}`;

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, userId, expiresAt);

  return expiresAt;
}

function getSessionUser(token) {
  if (!token) return null;
  try {
    const row = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.meno,
        u.priezvisko,
        u.mail,
        u.ures_tag,
        u.created_at,
        s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND datetime(s.expires_at) > datetime('now', 'localtime')
    `).get(token);

    return row || null;
  } catch (e) {
    return null;
  }
}

function deleteSession(token) {
  if (!token) return;
  try {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  } catch (e) {}
}

// =============================================================================
// OPERÁCIE S HR ADMIN (hr_admin)
// =============================================================================

function getAllHrAdmins() {
  return db.prepare(`
    SELECT 
      ha.id,
      ha.user_id,
      u.username,
      u.meno,
      u.priezvisko,
      u.mail,
      u.ures_tag,
      ha.pocet_interviews,
      ha.datum_interview,
      ha.updated_at
    FROM hr_admin ha
    JOIN users u ON u.id = ha.user_id
    ORDER BY ha.id ASC
  `).all();
}

function updateHrInterviewStats(hrUserId) {
  // Spočítanie počtu pohovorov a najbližšieho aktívneho termínu
  const stats = db.prepare(`
    SELECT 
      COUNT(*) AS cnt,
      COALESCE(
        MIN(CASE WHEN datum >= datetime('now', 'localtime') AND vyhodnotenie != 'zruseny' THEN datum END),
        MIN(CASE WHEN vyhodnotenie != 'zruseny' THEN datum END),
        MIN(datum)
      ) AS najblizsi_datum
    FROM interview
    WHERE hr_id = ?
  `).get(hrUserId);

  db.prepare(`
    UPDATE hr_admin 
    SET 
      pocet_interviews = ?,
      datum_interview = ?,
      updated_at = datetime('now', 'localtime')
    WHERE user_id = ?
  `).run(stats.cnt || 0, stats.najblizsi_datum || null, hrUserId);
}

// =============================================================================
// OPERÁCIE S POHOVORMI (interview)
// =============================================================================

function getAllInterviews() {
  return db.prepare(`
    SELECT 
      i.*,
      v.nazov AS vyhodnotenie_nazov,
      v.farba AS vyhodnotenie_farba,
      u.username AS hr_username,
      u.mail AS hr_mail
    FROM interview i
    LEFT JOIN vyhodnotenie v ON v.kod = i.vyhodnotenie
    LEFT JOIN users u ON u.id = i.hr_id
    ORDER BY i.datum DESC, i.id DESC
  `).all();
}

function getInterviewById(id) {
  return db.prepare(`
    SELECT 
      i.*,
      v.nazov AS vyhodnotenie_nazov,
      v.farba AS vyhodnotenie_farba,
      u.meno AS hr_meno,
      u.priezvisko AS hr_priezvisko,
      u.username AS hr_username,
      u.mail AS hr_mail
    FROM interview i
    LEFT JOIN vyhodnotenie v ON v.kod = i.vyhodnotenie
    LEFT JOIN users u ON u.id = i.hr_id
    WHERE i.id = ?
  `).get(id);
}

function getInterviewByRoomId(roomId) {
  return db.prepare(`
    SELECT 
      i.*,
      v.nazov AS vyhodnotenie_nazov,
      v.farba AS vyhodnotenie_farba,
      u.meno AS hr_meno,
      u.priezvisko AS hr_priezvisko,
      u.username AS hr_username,
      u.mail AS hr_mail
    FROM interview i
    LEFT JOIN vyhodnotenie v ON v.kod = i.vyhodnotenie
    LEFT JOIN users u ON u.id = i.hr_id
    WHERE i.room_id = ?
  `).get(roomId);
}

function getInterviewsByHr(hrId) {
  return db.prepare(`
    SELECT 
      i.*,
      v.nazov AS vyhodnotenie_nazov,
      v.farba AS vyhodnotenie_farba,
      u.meno AS hr_meno,
      u.priezvisko AS hr_priezvisko,
      u.username AS hr_username,
      u.mail AS hr_mail
    FROM interview i
    LEFT JOIN vyhodnotenie v ON v.kod = i.vyhodnotenie
    LEFT JOIN users u ON u.id = i.hr_id
    WHERE i.hr_id = ?
    ORDER BY i.datum ASC, i.id ASC
  `).all(hrId);
}

function formatDateTimeSk(dateStr) {
  try {
    const d = new Date(dateStr.replace(' ', 'T'));
    if (isNaN(d.getTime())) return dateStr;
    const pad = n => String(n).padStart(2, '0');
    const days = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
    const months = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna', 'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra'];
    return `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()} o ${pad(d.getHours())}:${pad(d.getMinutes())} (${days[d.getDay()]})`;
  } catch (e) {
    return dateStr;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseEmailList(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return Array.from(new Set(
      input
        .map(e => String(e).trim().toLowerCase())
        .filter(e => e.includes('@') && e.length > 3)
    ));
  }
  return Array.from(new Set(
    String(input)
      .split(/[,;\s]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e.includes('@') && e.length > 3)
  ));
}

function generateIcsContent(interview, options = {}) {
  const parseDate = (dStr) => {
    if (!dStr) return new Date();
    const d = new Date(String(dStr).replace(' ', 'T'));
    if (isNaN(d.getTime())) return new Date();
    return d;
  };
  const startDate = parseDate(interview.datum);
  const endDate = new Date(startDate.getTime() + 45 * 60 * 1000);

  const formatIcsDate = (d) => {
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const uid = `interview-${interview.id}-${interview.room_id}@fiit.stuba.sk`;
  const now = formatIcsDate(new Date());
  const dtStart = formatIcsDate(startDate);
  const dtEnd = formatIcsDate(endDate);

  const method = options.method || 'REQUEST';
  const status = options.status || (method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED');
  const sequence = options.sequence !== undefined ? options.sequence : (method === 'CANCEL' ? 2 : 0);
  const joinUrl = options.joinUrl || interview.link_meeting || '';

  const cleanTitle = (interview.titul_pozicia || 'Online pohovor').replace(/[\r\n]+/g, ' ');
  const defaultDesc = method === 'CANCEL'
    ? `Online výberový pohovor na pozíciu ${cleanTitle} bol zrušený.\\n\\nKandidát: ${interview.meno_respondenta}\\nHR Konzultant: ${interview.meno_hr}`
    : `Pozvánka na online výberový pohovor na pozíciu ${cleanTitle}.\\n\\nKandidát: ${interview.meno_respondenta}\\nHR Konzultant: ${interview.meno_hr}\\n\\nPripojenie na pohovor:\\n${joinUrl}\\n\\nSystém automatickej multimodálnej analýzy pohovorov (FIIT STU).`;
  
  const desc = options.description || defaultDesc;
  const summary = options.summary || (method === 'CANCEL' ? `ZRUŠENÉ: Online pohovor: ${cleanTitle}` : `Online pohovor: ${cleanTitle}`);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FIIT STU//Automaticka analyza online pohovorov//SK',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${joinUrl || 'Online'}`,
    `URL:${joinUrl}`,
    `STATUS:${status}`,
    `SEQUENCE:${sequence}`,
  ];

  if (method !== 'CANCEL') {
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Pripomienka: Online pohovor začína o 15 minút',
      'END:VALARM'
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

function getUserByEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || !clean.includes('@')) return null;
  return db.prepare(`
    SELECT id, username, meno, priezvisko, mail, ures_tag
    FROM users
    WHERE LOWER(TRIM(mail)) = ?
    LIMIT 1
  `).get(clean) || null;
}

function buildPersonalizedMeetingLink(baseUrl, email) {
  const raw = String(baseUrl || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!raw || !cleanEmail || !cleanEmail.includes('@')) return raw;
  try {
    const u = new URL(raw);
    u.searchParams.set('invitee', cleanEmail);
    return u.toString();
  } catch (_) {
    const cleanBase = raw.split('#')[0];
    const sep = cleanBase.includes('?') ? '&' : '?';
    return `${cleanBase}${sep}invitee=${encodeURIComponent(cleanEmail)}`;
  }
}

function resolveMeetingParticipant(roomId, { authUser = null, inviteeEmail = '', autoJoin = false } = {}) {
  const cleanInvitee = String(inviteeEmail || '').trim().toLowerCase();
  const interview = roomId ? getInterviewByRoomId(roomId) : null;

  const formatUserName = (u) => {
    if (!u) return '';
    const full = `${u.meno || ''} ${u.priezvisko || ''}`.trim();
    return full || u.username || '';
  };

  // 1. HR alebo Superadmin klikol na "Vstúpiť" z administrácie (?autojoin=1)
  if (autoJoin && authUser) {
    const fullName = formatUserName(authUser);
    const email = String(authUser.mail || '').trim();
    return {
      matched: !!fullName,
      source: 'staff_autojoin',
      autoJoin: true,
      name: fullName,
      email,
      role: authUser.ures_tag || 'HR_ADMIN',
    };
  }

  // 2. Účastník klikol na personalizovaný odkaz z e-mailu (?invitee=...)
  if (cleanInvitee && cleanInvitee.includes('@')) {
    const candEmail = interview ? String(interview.mail_respondenta || '').trim().toLowerCase() : '';
    const candName = interview ? String(interview.meno_respondenta || '').trim() : '';
    const isPlaceholderCandidate = !candName || candName === 'Kandidát' || (interview && interview.poznamky === 'Vytvorené priamym vstupom cez link');

    // 2a) Uchádzač (meno a e-mail zo sekcie Meno respondenta)
    if (interview && candEmail === cleanInvitee && !isPlaceholderCandidate) {
      return {
        matched: true,
        source: 'candidate_invite',
        autoJoin: false,
        name: candName,
        email: cleanInvitee,
        role: 'candidate',
      };
    }

    // 2b) Pozvaný kolega / HR s registrovaným účtom na stránke
    const accountUser = getUserByEmail(cleanInvitee);
    if (accountUser) {
      return {
        matched: true,
        source: 'colleague_account',
        autoJoin: false,
        name: formatUserName(accountUser),
        email: String(accountUser.mail || cleanInvitee).trim(),
        role: accountUser.ures_tag || 'colleague',
      };
    }

    // 2c) Externý kolega bez účtu na stránke - predvyplní sa aspoň jeho e-mail
    return {
      matched: true,
      source: 'external_invitee',
      autoJoin: false,
      name: '',
      email: cleanInvitee,
      role: 'guest',
    };
  }

  // 3. Prihlásený HR / Superadmin otvoril všeobecný link (bez autojoin a bez ?invitee=)
  if (authUser) {
    return {
      matched: true,
      source: 'staff_logged_in',
      autoJoin: false,
      name: formatUserName(authUser),
      email: String(authUser.mail || '').trim(),
      role: authUser.ures_tag || 'HR_ADMIN',
    };
  }

  // 4. Neprihlásený účastník otvoril skopírovaný link k naplánovanému pohovoru
  if (interview) {
    const candName = String(interview.meno_respondenta || '').trim();
    const candEmail = String(interview.mail_respondenta || '').trim();
    const isPlaceholderCandidate = !candName || candName === 'Kandidát' || interview.poznamky === 'Vytvorené priamym vstupom cez link';
    if (!isPlaceholderCandidate) {
      return {
        matched: true,
        source: 'interview_candidate',
        autoJoin: false,
        name: candName,
        email: candEmail,
        role: 'candidate',
      };
    }
  }

  return {
    matched: false,
    source: 'anonymous',
    autoJoin: false,
    name: '',
    email: '',
    role: 'guest',
  };
}

function generateInterviewInvitation(interview) {
  const formattedDatum = formatDateTimeSk(interview.datum);
  const title = interview.titul_pozicia || 'Online pohovor';
  const subject = `Pozvánka na online pohovor: ${title} – FIIT STU`;
  const joinUrl = buildPersonalizedMeetingLink(interview.link_meeting, interview.mail_respondenta);

  const htmlContent = `
<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .email-card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.06); }
    .email-header { background: #7c3aed; padding: 30px 24px; color: white; text-align: center; }
    .email-header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
    .email-header p { margin: 6px 0 0; opacity: 0.9; font-size: 13px; }
    .email-body { padding: 32px 28px; line-height: 1.6; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #7c3aed; border-radius: 8px; padding: 18px 20px; margin: 24px 0; }
    .info-row { display: flex; margin-bottom: 8px; font-size: 14px; }
    .info-label { font-weight: 600; width: 140px; color: #64748b; }
    .info-value { font-weight: 700; color: #0f172a; }
    .btn-join { display: inline-block; background: #7c3aed; color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; text-align: center; margin: 20px 0; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35); }
    .btn-container { text-align: center; }
    .notice { font-size: 12px; color: #64748b; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: 12px; margin-top: 20px; }
    .email-footer { background: #f8fafc; padding: 16px 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="email-card">
    <div class="email-header">
      <h1>Pozvánka na online pohovor</h1>
      <p>Automatická analýza pohovorov · FIIT Slovenská technická univerzita</p>
    </div>
    <div class="email-body">
      <p>Dobrý deň <strong>${escapeHtml(interview.meno_respondenta)}</strong>,</p>
      <p>s potešením Vás pozývame na online výberový pohovor na pozíciu <strong>${escapeHtml(title)}</strong>.</p>
      
      <div class="info-box">
        <div class="info-row"><span class="info-label">📅 Dátum a čas:</span><span class="info-value">${escapeHtml(formattedDatum)}</span></div>
        <div class="info-row"><span class="info-label">👔 HR Konzultant:</span><span class="info-value">${escapeHtml(interview.meno_hr)}</span></div>
        <div class="info-row"><span class="info-label">💼 Pracovná pozícia:</span><span class="info-value">${escapeHtml(title)}</span></div>
        <div class="info-row"><span class="info-label">🔑 ID miestnosti:</span><span class="info-value"><code>${escapeHtml(interview.room_id)}</code></span></div>
      </div>

      <div class="btn-container">
        <a href="${joinUrl}" class="btn-join">Vstúpiť do virtuálnej miestnosti</a>
      </div>

      <p style="font-size: 13px; color: #475569; word-break: break-all;">
        Priamy odkaz na pripojenie k videohovoru:<br>
        <a href="${joinUrl}" style="color: #7c3aed;">${joinUrl}</a>
      </p>

      <div class="notice">
        <strong>💡 Technické inštrukcie:</strong><br>
        • Pripojte sa prosím 5 minút pred stanoveným časom.<br>
        • Pohovor prebieha priamo vo webovom prehliadači (Chrome, Firefox, Edge). Nie je potrebná inštalácia softvéru.<br>
        • Uistite sa, že máte funkčnú webkameru a mikrofón. Počas hovoru prebieha automatická analýza očného kontaktu a reči.
      </div>
    </div>
    <div class="footer" style="background: #f8fafc; padding: 16px 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9;">
      Tento email bol vygenerovaný automatickým systémom správy pohovorov FIIT STU v Bratislave.<br>
      © ${new Date().getFullYear()} FIIT STU Bratislava · Všetky práva vyhradené.
    </div>
  </div>
</body>
</html>
  `.trim();

  const plainText = `
Dobrý deň ${interview.meno_respondenta},

Pozývame Vás na online výberový pohovor na pozíciu: ${title}

📅 DÁTUM A ČAS: ${formattedDatum}
👔 HR KONZULTANT: ${interview.meno_hr}
💼 PRACOVNÁ POZÍCIA: ${title}
🔑 KÓD MIESTNOSTI: ${interview.room_id}

ODKAZ NA PRIPOJENIE:
${joinUrl}

INŠTRUKCIE:
- Pripojte sa prosím 5 minút vopred cez webový prehliadač.
- Skontrolujte funkčnosť kamery a mikrofónu.
- Počas pohovoru bude prebiehať analýza reči a očného kontaktu.

S pozdravom,
${interview.meno_hr}
FIIT STU v Bratislave
  `.trim();

  const ics = generateIcsContent(interview, { joinUrl });

  return {
    subject,
    recipientEmail: interview.mail_respondenta,
    recipientName: interview.meno_respondenta,
    hrName: interview.meno_hr,
    datum: interview.datum,
    formattedDatum,
    meetingUrl: joinUrl,
    html: htmlContent,
    text: plainText,
    ics,
    sentAt: new Date().toISOString(),
    status: 'odoslana',
  };
}

function generateColleagueInvitation(interview, options = {}) {
  const formattedDatum = formatDateTimeSk(interview.datum);
  const title = interview.titul_pozicia || 'Online pohovor';
  const roleName = options.role || 'Pozorovateľ / Člen tímu';
  const customNote = options.note || 'Boli ste prizvaný ako člen tímu / pozorovateľ na tento online výberový pohovor, aby ste mohli sledovať odpovede a reakcie kandidáta.';
  const subject = `Pozvánka na online pohovor (Účasť tímu / Team Leader): ${title} – FIIT STU`;
  const colleagueUser = options.recipientEmail ? getUserByEmail(options.recipientEmail) : null;
  const colleagueName = colleagueUser ? `${colleagueUser.meno || ''} ${colleagueUser.priezvisko || ''}`.trim() : '';
  const joinUrl = buildPersonalizedMeetingLink(interview.link_meeting, options.recipientEmail);

  const htmlContent = `
<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .email-card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.06); }
    .email-header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 30px 24px; color: white; text-align: center; }
    .email-header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
    .email-header p { margin: 6px 0 0; opacity: 0.9; font-size: 13px; }
    .email-body { padding: 32px 28px; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 14px; color: #0f172a; }
    .text-p { font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 16px; }
    .team-badge { display: inline-block; background: #ede9fe; color: #6d28d9; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px; margin-bottom: 16px; }
    .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13.5px; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #64748b; font-weight: 500; }
    .detail-val { color: #0f172a; font-weight: 600; text-align: right; }
    .btn-container { text-align: center; margin: 28px 0 20px; }
    .meeting-btn { display: inline-block; background: #6d28d9; color: #ffffff !important; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 14px rgba(109, 40, 217, 0.35); }
    .meeting-btn:hover { background: #5b21b6; }
    .link-fallback { background: #f1f5f9; border-radius: 6px; padding: 10px 12px; font-family: monospace; font-size: 12px; word-break: break-all; color: #334155; margin-top: 10px; }
    .note-box { background: #fdf4ff; border-left: 4px solid #a855f7; padding: 12px 14px; border-radius: 4px; margin: 18px 0; font-size: 13px; color: #701a75; }
    .ics-hint { font-size: 12px; color: #64748b; margin-top: 20px; text-align: center; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 11.5px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="email-card">
    <div class="email-header">
      <h1>Pozvánka na online pohovor pre tím</h1>
      <p>Systém automatickej multimodálnej analýzy pohovorov · FIIT STU</p>
    </div>
    <div class="email-body">
      <div class="team-badge">👥 ÚČASŤ TÍMU / POZOROVATEĽ</div>
      <div class="greeting">Dobrý deň${colleagueName ? ' ' + escapeHtml(colleagueName) : ''},</div>
      <p class="text-p">
        Boli ste prizvaný ako <strong>${escapeHtml(roleName)}</strong> na online výberový pohovor. Môžete sa pripojiť priamo cez odkaz nižšie, sledovať odpovede a reakcie kandidáta v reálnom čase a podieľať sa na vyhodnotení.
      </p>

      <div class="note-box">
        <strong>Poznámka / Účel účasti:</strong><br>
        ${escapeHtml(customNote)}
      </div>

      <div class="details-box">
        <div class="detail-row">
          <span class="detail-label">Pracovná pozícia:</span>
          <span class="detail-val" style="color: #6d28d9;">${escapeHtml(interview.titul_pozicia || 'Pohovor')}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Kandidát (Uchádzač):</span>
          <span class="detail-val">${escapeHtml(interview.meno_respondenta)} (${escapeHtml(interview.mail_respondenta)})</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Termín pohovoru:</span>
          <span class="detail-val" style="color: #059669;">${formattedDatum}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Zodpovedný HR konzultant:</span>
          <span class="detail-val">${escapeHtml(interview.meno_hr)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Kód miestnosti (Room ID):</span>
          <span class="detail-val">${escapeHtml(interview.room_id)}</span>
        </div>
      </div>

      <div class="btn-container">
        <a href="${joinUrl}" class="meeting-btn" target="_blank">
          Pripojiť sa k pohovoru
        </a>
        <div class="link-fallback">${joinUrl}</div>
      </div>

      <p class="ics-hint">
        📅 <strong>Kalendár:</strong> V prílohe nájdete súbor <code>.ics</code> pre automatické pridanie termínu do Vášho Google Calendar, Outlook alebo Apple Calendar.
      </p>
    </div>
    <div class="footer">
      FIIT Slovenská technická univerzita v Bratislave · Projekt automatickej analýzy online pohovorov<br>
      Tento e-mail bol vygenerovaný automaticky na základe pozvánky od personalistu.
    </div>
  </div>
</body>
</html>
  `.trim();

  const plainText = `
Pozvánka na online pohovor (Účasť tímu / Team Leader)
======================================================
Dobrý deň${colleagueName ? ' ' + colleagueName : ''},

boli ste prizvaný ako ${roleName} na online výberový pohovor:

- Pracovná pozícia: ${interview.titul_pozicia || 'Pohovor'}
- Kandidát: ${interview.meno_respondenta} (${interview.mail_respondenta})
- Termín: ${formattedDatum}
- HR konzultant: ${interview.meno_hr}
- Účel / Poznámka: ${customNote}

Priamy odkaz na pripojenie k videohovoru:
${joinUrl}
Kód miestnosti: ${interview.room_id}

V prílohe nájdete súbor .ics pre automatické pridanie do Vášho kalendára.

Automatická analýza online pohovorov · FIIT STU
  `.trim();

  const ics = generateIcsContent(interview, {
    joinUrl,
    summary: `Online pohovor (Tím): ${interview.titul_pozicia || 'Pohovor'} – ${interview.meno_respondenta}`,
    description: `Online pohovor na pozíciu ${interview.titul_pozicia || 'Pohovor'}.\\nKandidát: ${interview.meno_respondenta} (${interview.mail_respondenta})\\nHR: ${interview.meno_hr}\\nRola: ${roleName}\\n\\nOdkaz na videohovor:\\n${joinUrl}`,
  });

  return {
    subject,
    recipientEmail: options.recipientEmail || '',
    role: roleName,
    note: customNote,
    formattedDatum,
    html: htmlContent,
    text: plainText,
    ics,
    sentAt: new Date().toISOString(),
  };
}

function generateInterviewReminder(interview, options = {}) {
  const formattedDatum = formatDateTimeSk(interview.datum);
  const time = (() => {
    try {
      const d = new Date(interview.datum.replace(' ', 'T'));
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (_) {
      return '10:00';
    }
  })();
  const title = interview.titul_pozicia || 'Online pohovor';
  const targetEmail = options.recipientEmail || interview.mail_respondenta;
  const joinUrl = buildPersonalizedMeetingLink(interview.link_meeting, targetEmail);
  const isColleague = !!options.isColleague;
  const colleagueUser = isColleague && targetEmail ? getUserByEmail(targetEmail) : null;
  const greetingName = isColleague
    ? (colleagueUser ? `${colleagueUser.meno || ''} ${colleagueUser.priezvisko || ''}`.trim() : '')
    : interview.meno_respondenta;
  const subject = isColleague
    ? `Pripomienka (Účasť tímu): Zajtra o ${time} je online pohovor – ${title}`
    : `Pripomienka: Zajtra o ${time} máte online pohovor – ${title}`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .email-card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.06); }
    .email-header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 30px 24px; color: white; text-align: center; }
    .email-header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
    .email-header p { margin: 6px 0 0; opacity: 0.95; font-size: 13px; }
    .badge-tomorrow { display: inline-block; background: rgba(255, 255, 255, 0.25); border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 20px; padding: 5px 16px; font-weight: 700; font-size: 13px; margin-top: 12px; }
    .email-body { padding: 32px 28px; line-height: 1.6; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #10b981; border-radius: 8px; padding: 18px 20px; margin: 24px 0; }
    .info-row { display: flex; margin-bottom: 8px; font-size: 14px; }
    .info-label { font-weight: 600; width: 140px; color: #64748b; }
    .info-value { font-weight: 700; color: #0f172a; }
    .btn-join { display: inline-block; background: #059669; color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; text-align: center; margin: 20px 0; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35); }
    .btn-container { text-align: center; }
    .notice { font-size: 12px; color: #64748b; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: 12px; margin-top: 20px; }
    .email-footer { background: #f8fafc; padding: 16px 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="email-card">
    <div class="email-header">
      <h1>Pripomienka online pohovoru</h1>
      <p>Automatická analýza pohovorov · FIIT Slovenská technická univerzita</p>
      <div class="badge-tomorrow">⏰ Váš pohovor sa uskutoční ZAJTRA o ${escapeHtml(time)}</div>
    </div>
    <div class="email-body">
      <p>Dobrý deň${greetingName ? ` <strong>${escapeHtml(greetingName)}</strong>` : ''},</p>
      <p>${isColleague
        ? `pripomíname Vám, že <strong>zajtra o ${escapeHtml(time)}</strong> sa koná online výberový pohovor na pozíciu <strong>${escapeHtml(title)}</strong> (kandidát: <strong>${escapeHtml(interview.meno_respondenta)}</strong>), na ktorý ste prizvaný ako člen tímu.`
        : `dovoľujeme si Vám pripomenúť, že <strong>zajtra o ${escapeHtml(time)}</strong> máte naplánovaný online výberový pohovor na pracovnú pozíciu <strong>${escapeHtml(title)}</strong>.`
      }</p>
      
      <div class="info-box">
        <div class="info-row"><span class="info-label">📅 Dátum a čas:</span><span class="info-value">Zajtra (${escapeHtml(formattedDatum)})</span></div>
        <div class="info-row"><span class="info-label">⏰ Presný čas:</span><span class="info-value" style="color: #059669; font-size: 16px;">${escapeHtml(time)}</span></div>
        <div class="info-row"><span class="info-label">👔 HR Konzultant:</span><span class="info-value">${escapeHtml(interview.meno_hr)}</span></div>
        <div class="info-row"><span class="info-label">💼 Pracovná pozícia:</span><span class="info-value">${escapeHtml(title)}</span></div>
        <div class="info-row"><span class="info-label">🔑 ID miestnosti:</span><span class="info-value"><code>${escapeHtml(interview.room_id)}</code></span></div>
      </div>

      <div class="btn-container">
        <a href="${joinUrl}" class="btn-join">Vstúpiť do virtuálnej miestnosti</a>
      </div>

      <p style="font-size: 13px; color: #475569; word-break: break-all;">
        Priamy odkaz na pripojenie k videohovoru:<br>
        <a href="${joinUrl}" style="color: #059669;">${joinUrl}</a>
      </p>

      <div class="notice">
        <strong>💡 Dôležité odporúčania pred zajtrajším pohovorom:</strong><br>
        • Pripojte sa prosím 5 minút pred stanoveným časom (${escapeHtml(time)}).<br>
        • Pohovor prebieha priamo vo webovom prehliadači, nie je nutné inštalovať žiadny program.<br>
        • Počas hovoru prebieha automatická analýza očného kontaktu a reči – odporúčame otestovať si funkčnosť webkamery a mikrofónu a zabezpečiť si tiché, dobre osvetlené prostredie.
      </div>
    </div>
    <div class="email-footer">
      Tento pripomienkový email bol odoslaný automatickým systémom FIIT STU v Bratislave.<br>
      © ${new Date().getFullYear()} FIIT STU Bratislava · Všetky práva vyhradené.
    </div>
  </div>
</body>
</html>
  `.trim();

  const plainText = `
Dobrý deň${greetingName ? ' ' + greetingName : ''},

Pripomíname Vám, že ZAJTRA o ${time} ${isColleague ? `sa koná online výberový pohovor (kandidát: ${interview.meno_respondenta})` : 'máte naplánovaný online výberový pohovor'} na pozíciu: ${title}

📅 DÁTUM A ČAS: Zajtra (${formattedDatum})
⏰ ČAS POHOVORU: ${time}
👔 HR KONZULTANT: ${interview.meno_hr}
💼 PRACOVNÁ POZÍCIA: ${title}
🔑 ID MIESTNOSTI: ${interview.room_id}

🌐 LINK NA PRIPOJENIE:
${joinUrl}

💡 ODPORÚČANIA:
- Pripojte sa prosím 5 minút pred stanoveným časom (${time}).
- Uistite sa, že máte funkčnú kameru a mikrofón v tichom prostredí.

S pozdravom,
Tím automatickej analýzy online pohovorov
FIIT STU v Bratislave
  `.trim();

  const ics = generateIcsContent(interview, { joinUrl });

  return {
    subject,
    recipientEmail: targetEmail,
    recipientName: greetingName || interview.meno_respondenta,
    hrName: interview.meno_hr,
    datum: interview.datum,
    formattedDatum,
    time,
    meetingUrl: joinUrl,
    html: htmlContent,
    text: plainText,
    ics,
    sentAt: new Date().toISOString(),
    status: 'pripravena',
  };
}

function generateInterviewReschedule(interview, oldDatum, reason = '', options = {}) {
  const formattedNewDatum = formatDateTimeSk(interview.datum);
  const formattedOldDatum = oldDatum ? formatDateTimeSk(oldDatum) : 'Pôvodný termín';
  const title = interview.titul_pozicia || 'Online pohovor';
  const targetEmail = options.recipientEmail || interview.mail_respondenta;
  const joinUrl = buildPersonalizedMeetingLink(interview.link_meeting, targetEmail);
  const isColleague = !!options.isColleague;
  const colleagueUser = isColleague && targetEmail ? getUserByEmail(targetEmail) : null;
  const greetingName = isColleague
    ? (colleagueUser ? `${colleagueUser.meno || ''} ${colleagueUser.priezvisko || ''}`.trim() : '')
    : interview.meno_respondenta;
  const subject = isColleague
    ? `Zmena termínu (Účasť tímu): ${title} – FIIT STU`
    : `Zmena termínu online pohovoru: ${title} – FIIT STU`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .email-card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.06); }
    .email-header { background: #0284c7; padding: 30px 24px; color: white; text-align: center; }
    .email-header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
    .email-header p { margin: 6px 0 0; opacity: 0.9; font-size: 13px; }
    .email-body { padding: 32px 28px; line-height: 1.6; }
    .reschedule-box { background: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0284c7; border-radius: 8px; padding: 18px 20px; margin: 24px 0; }
    .info-row { display: flex; margin-bottom: 8px; font-size: 14px; }
    .info-label { font-weight: 600; width: 140px; color: #64748b; }
    .info-value { font-weight: 700; color: #0f172a; }
    .old-date { text-decoration: line-through; color: #94a3b8; font-weight: normal; }
    .new-date { color: #0369a1; font-weight: 800; font-size: 15px; }
    .btn-join { display: inline-block; background: #0284c7; color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; text-align: center; margin: 20px 0; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35); }
    .btn-container { text-align: center; }
    .notice { font-size: 12px; color: #64748b; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: 12px; margin-top: 20px; }
    .reason-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #475569; margin: 16px 0; }
    .email-footer { background: #f8fafc; padding: 16px 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="email-card">
    <div class="email-header">
      <h1>Presun termínu online pohovoru</h1>
      <p>Automatická analýza pohovorov · FIIT Slovenská technická univerzita</p>
    </div>
    <div class="email-body">
      <p>Dobrý deň${greetingName ? ` <strong>${escapeHtml(greetingName)}</strong>` : ''},</p>
      <p>informujeme Vás o zmene termínu online výberového pohovoru na pozíciu <strong>${escapeHtml(title)}</strong>${isColleague ? ` (kandidát: <strong>${escapeHtml(interview.meno_respondenta)}</strong>)` : ''}.</p>

      <div class="reschedule-box">
        <div class="info-row"><span class="info-label">📅 Nový termín:</span><span class="info-value new-date">${escapeHtml(formattedNewDatum)}</span></div>
        <div class="info-row"><span class="info-label">⏳ Pôvodný termín:</span><span class="info-value old-date">${escapeHtml(formattedOldDatum)}</span></div>
        <div class="info-row"><span class="info-label">👔 HR Konzultant:</span><span class="info-value">${escapeHtml(interview.meno_hr)}</span></div>
        <div class="info-row"><span class="info-label">💼 Pracovná pozícia:</span><span class="info-value">${escapeHtml(title)}</span></div>
        <div class="info-row"><span class="info-label">🔑 ID miestnosti:</span><span class="info-value"><code>${escapeHtml(interview.room_id)}</code></span></div>
      </div>

      ${reason ? `<div class="reason-box"><strong>Dôvod zmeny termínu:</strong> ${escapeHtml(reason)}</div>` : ''}

      <div class="btn-container">
        <a href="${joinUrl}" class="btn-join">Vstúpiť do virtuálnej miestnosti</a>
      </div>

      <p style="font-size: 13px; color: #475569; word-break: break-all;">
        Odkaz na pripojenie zostáva nezmenený:<br>
        <a href="${joinUrl}" style="color: #0284c7;">${joinUrl}</a>
      </p>

      <div class="notice">
        <strong>💡 Informácia k novému termínu:</strong><br>
        V prílohe tohto e-mailu nájdete aktualizovaný kalendárový súbor (.ics), ktorý automaticky aktualizuje termín vo Vašom kalendári. Deň pred novým termínom Vám zašleme krátku pripomienku.
      </div>
    </div>
    <div class="footer" style="background: #f8fafc; padding: 16px 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9;">
      Bakalárska práca · FIIT STU v Bratislave · Systém automatickej analýzy online pohovorov
    </div>
  </div>
</body>
</html>
  `.trim();

  const plainText = `
Dobrý deň${greetingName ? ' ' + greetingName : ''},

Informujeme Vás o zmene termínu online výberového pohovoru na pozíciu: ${title}

📅 NOVÝ TERMÍN: ${formattedNewDatum}
⏳ PÔVODNÝ TERMÍN: ${formattedOldDatum}
👔 HR KONZULTANT: ${interview.meno_hr}
💼 PRACOVNÁ POZÍCIA: ${title}
${reason ? `💬 DÔVOD ZMENY: ${reason}\n` : ''}
🌐 LINK NA PRIPOJENIE:
${joinUrl}

V prílohe nájdete aktualizovaný kalendárový súbor (.ics) s novým termínom.

S pozdravom,
Tím automatickej analýzy online pohovorov
FIIT STU v Bratislave
  `.trim();

  const ics = generateIcsContent(interview, {
    method: 'REQUEST',
    sequence: 2,
    joinUrl,
    summary: `Online pohovor: ${title} (Nový termín)`,
  });

  return {
    subject,
    recipientEmail: targetEmail,
    recipientName: greetingName || interview.meno_respondenta,
    newDatum: interview.datum,
    oldDatum,
    formattedNewDatum,
    formattedOldDatum,
    html: htmlContent,
    text: plainText,
    ics,
  };
}

function generateInterviewCancellation(interview, reason = '') {
  const formattedDatum = formatDateTimeSk(interview.datum);
  const title = interview.titul_pozicia || 'Online pohovor';
  const subject = `Zrušenie online pohovoru: ${title} – FIIT STU`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .email-card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.06); }
    .email-header { background: #dc2626; padding: 30px 24px; color: white; text-align: center; }
    .email-header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
    .email-header p { margin: 6px 0 0; opacity: 0.9; font-size: 13px; }
    .email-body { padding: 32px 28px; line-height: 1.6; }
    .cancel-box { background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 8px; padding: 18px 20px; margin: 24px 0; }
    .info-row { display: flex; margin-bottom: 8px; font-size: 14px; }
    .info-label { font-weight: 600; width: 140px; color: #64748b; }
    .info-value { font-weight: 700; color: #0f172a; }
    .reason-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 12px 14px; font-size: 13px; color: #475569; margin: 16px 0; }
    .email-footer { background: #f8fafc; padding: 16px 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="email-card">
    <div class="email-header">
      <h1>Zrušenie online pohovoru</h1>
      <p>Automatická analýza pohovorov · FIIT Slovenská technická univerzita</p>
    </div>
    <div class="email-body">
      <p>Dobrý deň <strong>${escapeHtml(interview.meno_respondenta)}</strong>,</p>
      <p>dovoľujeme si Vás informovať, že online výberový pohovor na pozíciu <strong>${escapeHtml(title)}</strong> bol zrušený.</p>

      <div class="cancel-box">
        <div class="info-row"><span class="info-label">📅 Pôvodný termín:</span><span class="info-value"><strike>${escapeHtml(formattedDatum)}</strike></span></div>
        <div class="info-row"><span class="info-label">👔 HR Konzultant:</span><span class="info-value">${escapeHtml(interview.meno_hr)}</span></div>
        <div class="info-row"><span class="info-label">💼 Pracovná pozícia:</span><span class="info-value">${escapeHtml(title)}</span></div>
        <div class="info-row"><span class="info-label">Status:</span><span class="info-value" style="color: #dc2626;">ZRUŠENÝ</span></div>
      </div>

      ${reason ? `<div class="reason-box"><strong>Dôvod zrušenia:</strong> ${escapeHtml(reason)}</div>` : ''}

      <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
        V prílohe nájdete storno kalendárového záznamu (.ics), ktorý automaticky označí udalosť vo Vašom kalendári ako zrušenú.
      </p>
    </div>
    <div class="email-footer">
      Bakalárska práca · FIIT STU v Bratislave · Systém automatickej analýzy online pohovorov
    </div>
  </div>
</body>
</html>
  `.trim();

  const plainText = `
Dobrý deň ${interview.meno_respondenta},

Dovoľujeme si Vás informovať, že online výberový pohovor na pozíciu: ${title} bol zrušený.

📅 PÔVODNÝ TERMÍN: ${formattedDatum}
👔 HR KONZULTANT: ${interview.meno_hr}
💼 PRACOVNÁ POZÍCIA: ${title}
STATUS: ZRUŠENÝ
${reason ? `💬 DÔVOD ZRUŠENIA: ${reason}\n` : ''}

V prílohe nájdete storno kalendárového záznamu (.ics).

S pozdravom,
Tím automatickej analýzy online pohovorov
FIIT STU v Bratislave
  `.trim();

  const ics = generateIcsContent(interview, {
    method: 'CANCEL',
    status: 'CANCELLED',
    sequence: 3,
    summary: `ZRUŠENÉ: Online pohovor: ${title}`,
  });

  return {
    subject,
    recipientEmail: interview.mail_respondenta,
    recipientName: interview.meno_respondenta,
    datum: interview.datum,
    formattedDatum,
    html: htmlContent,
    text: plainText,
    ics,
  };
}

function createInterview({
  datum,
  hr_id,
  meno_respondenta,
  mail_respondenta,
  link_meeting,
  room_id,
  titul_pozicia,
  vyhodnotenie = 'neprebehlo',
  poznamky = '',
  dalsie_maily = '',
}, author = 'admin', options = {}) {
  if (!datum || !hr_id || !meno_respondenta || !mail_respondenta || !link_meeting || !room_id) {
    throw new Error('Chýbajú povinné údaje pre pohovor!');
  }

  const cleanDatum = String(datum).trim().replace('T', ' ');
  const parsedDate = new Date(cleanDatum.replace(' ', 'T'));
  if (isNaN(parsedDate.getTime())) {
    throw new Error('Neplatný formát dátumu a času.');
  }

  // Kontrola, aby termín pohovoru nebol v minulosti (tolerancia 60 sekúnd na odoslanie požiadavky)
  if (!options?.allowPast && parsedDate.getTime() < Date.now() - 60000) {
    throw new Error('Termín pohovoru nemôže byť v minulosti. Zadajte prosím aktuálny alebo budúci dátum a čas.');
  }

  const hrUser = db.prepare('SELECT meno, priezvisko FROM users WHERE id = ?').get(hr_id);
  if (!hrUser) throw new Error('Zadaný HR používateľ neexistuje!');

  const meno_hr = `${hrUser.meno} ${hrUser.priezvisko}`;
  const cleanDalsieMaily = dalsie_maily ? parseEmailList(dalsie_maily).join(', ') : null;

  const res = db.prepare(`
    INSERT INTO interview (
      datum, hr_id, meno_hr, meno_respondenta, mail_respondenta,
      link_meeting, room_id, titul_pozicia, vyhodnotenie, poznamky,
      dalsie_maily,
      reminder_sent, reminder_sent_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
  `).run(
    datum,
    hr_id,
    meno_hr,
    meno_respondenta,
    mail_respondenta,
    link_meeting,
    room_id,
    titul_pozicia || 'Pohovor',
    vyhodnotenie,
    poznamky,
    cleanDalsieMaily
  );

  const interviewId = Number(res.lastInsertRowid);

  // Vytvorenie základného analytického slotu
  db.prepare(`
    INSERT INTO interview_analyza (interview_id, skore_pozornosti, dominantna_emocia, pocet_vyplnovych_slov, stav_analyzy)
    VALUES (?, 0.0, 'čaká na vyhodnotenie', 0, 'cakajuce')
  `).run(interviewId);

  updateHrInterviewStats(hr_id);

  logAudit(
    'VYTVORENIE_INTERVIEW',
    author,
    `Vytvorený pohovor "${titul_pozicia || 'Pohovor'}" pre kandidáta "${meno_respondenta}" (HR: ${meno_hr}, Kód: ${room_id})${cleanDalsieMaily ? ' [Pozvaní kolegovia: ' + cleanDalsieMaily + ']' : ''}`
  );

  // Automatické vygenerovanie a odoslanie pozvánky na pohovor
  const createdInterviewData = {
    id: interviewId,
    datum,
    hr_id,
    meno_hr,
    meno_respondenta,
    mail_respondenta,
    link_meeting,
    room_id,
    titul_pozicia: titul_pozicia || 'Pohovor',
    vyhodnotenie,
    poznamky,
    dalsie_maily: cleanDalsieMaily,
    reminder_sent: 0,
    reminder_sent_at: null,
  };

  const invitation = generateInterviewInvitation(createdInterviewData);

  logAudit(
    'POZVANKA_ODOSLANA',
    author,
    `Automatická pozvánka na pohovor "${titul_pozicia || 'Pohovor'}" úspešne odoslaná na email kandidáta ${meno_respondenta} (${mail_respondenta}) na termín ${datum}. Link: ${link_meeting}`
  );

  notifyDbChange('INTERVIEW_CREATED', { interviewId, room_id, meno_respondenta });

  return {
    ...createdInterviewData,
    invitation,
  };
}

function addInterviewColleague(id, emails, author = 'admin') {
  const existing = db.prepare('SELECT id, room_id, meno_respondenta, titul_pozicia, dalsie_maily FROM interview WHERE id = ?').get(id);
  if (!existing) throw new Error('Pohovor neexistuje.');

  const currentList = parseEmailList(existing.dalsie_maily);
  const toAdd = parseEmailList(emails);
  const combined = Array.from(new Set([...currentList, ...toAdd]));
  const updatedStr = combined.length > 0 ? combined.join(', ') : null;

  db.prepare('UPDATE interview SET dalsie_maily = ? WHERE id = ?').run(updatedStr, id);

  logAudit(
    'POZVANKA_KOLEGOVI_PRIDANA',
    author,
    `K pohovoru #${id} (${existing.titul_pozicia}) boli priradení ďalší zamestnanci / pozorovatelia: ${toAdd.join(', ')}`
  );

  notifyDbChange('INTERVIEW_COLLEAGUES_UPDATED', { interviewId: id, dalsie_maily: updatedStr });
  return { id, dalsie_maily: updatedStr, added: toAdd };
}

function updateInterviewEvaluation(id, vyhodnotenie, author = 'admin') {
  const existing = db.prepare('SELECT id, meno_respondenta, vyhodnotenie FROM interview WHERE id = ?').get(id);
  if (!existing) throw new Error('Pohovor s daným ID neexistuje!');

  const validEnum = db.prepare('SELECT kod FROM vyhodnotenie WHERE kod = ?').get(vyhodnotenie);
  if (!validEnum) throw new Error(`Neplatný status vyhodnotenia: ${vyhodnotenie}`);

  db.prepare('UPDATE interview SET vyhodnotenie = ? WHERE id = ?').run(vyhodnotenie, id);

  logAudit(
    'ZMENA_VYHODNOTENIA',
    author,
    `Vyhodnotenie pohovoru #${id} (${existing.meno_respondenta}) zmenené z "${existing.vyhodnotenie}" na "${vyhodnotenie}"`
  );

  notifyDbChange('EVALUATION_UPDATED', { interviewId: id, vyhodnotenie });
  return true;
}

function deleteInterview(id, author = 'admin') {
  const interview = db.prepare('SELECT id, hr_id, room_id, meno_respondenta FROM interview WHERE id = ? OR room_id = ?').get(id, id);
  if (!interview) return false;

  db.prepare('DELETE FROM interview WHERE id = ?').run(interview.id);
  updateHrInterviewStats(interview.hr_id);

  logAudit(
    'ZMAZANIE_INTERVIEW',
    author,
    `Pohovor #${interview.id} pre kandidáta "${interview.meno_respondenta}" bol odstránený`
  );

  notifyDbChange('INTERVIEW_DELETED', { interviewId: interview.id, roomId: interview.room_id });
  return true;
}

function rescheduleInterview(id, newDatum, author = 'admin', options = {}) {
  const existing = db.prepare('SELECT * FROM interview WHERE id = ?').get(id);
  if (!existing) throw new Error('Pohovor s daným ID neexistuje!');

  const cleanDatum = String(newDatum).trim().replace('T', ' ');
  if (!cleanDatum) throw new Error('Zadajte platný nový dátum a čas pohovoru.');

  const parsedDate = new Date(cleanDatum.replace(' ', 'T'));
  if (isNaN(parsedDate.getTime())) {
    throw new Error('Neplatný formát dátumu a času.');
  }

  // Kontrola, aby termín pohovoru nebol v minulosti (tolerancia 60 sekúnd na odoslanie požiadavky)
  if (!options?.allowPast && parsedDate.getTime() < Date.now() - 60000) {
    throw new Error('Nový termín pohovoru nemôže byť v minulosti. Zadajte prosím budúci dátum a čas.');
  }

  const oldDatum = existing.datum;

  db.prepare(`
    UPDATE interview 
    SET 
      datum = ?,
      vyhodnotenie = CASE WHEN vyhodnotenie = 'zruseny' THEN 'neprebehlo' ELSE vyhodnotenie END,
      reminder_sent = 0,
      reminder_sent_at = NULL
    WHERE id = ?
  `).run(cleanDatum, id);

  updateHrInterviewStats(existing.hr_id);

  logAudit(
    'PRESUN_POHOVORU',
    author,
    `Pohovor #${id} (${existing.meno_respondenta}) presunutý z "${oldDatum}" na nový termín "${cleanDatum}"`
  );

  notifyDbChange('INTERVIEW_RESCHEDULED', {
    interviewId: id,
    oldDatum,
    newDatum: cleanDatum,
  });

  const updated = getInterviewById(id);
  return {
    ...updated,
    oldDatum,
  };
}

function cancelInterview(id, author = 'admin', reason = '') {
  const existing = db.prepare('SELECT * FROM interview WHERE id = ?').get(id);
  if (!existing) throw new Error('Pohovor s daným ID neexistuje!');

  let note = existing.poznamky || '';
  if (reason) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
    note = note ? `${note}\n[Zrušené ${timestamp}]: ${reason}` : `[Zrušené ${timestamp}]: ${reason}`;
  }

  db.prepare(`
    UPDATE interview 
    SET 
      vyhodnotenie = 'zruseny',
      poznamky = ?,
      reminder_sent = 1,
      reminder_sent_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(note, id);

  updateHrInterviewStats(existing.hr_id);

  logAudit(
    'ZRUSENIE_POHOVORU',
    author,
    `Pohovor #${id} (${existing.meno_respondenta}) bol zrušený.${reason ? ' Dôvod: ' + reason : ''}`
  );

  notifyDbChange('INTERVIEW_CANCELLED', {
    interviewId: id,
    reason,
  });

  return getInterviewById(id);
}

// =============================================================================
// ČÍSELNÍK VYHODNOTENÍ (vyhodnotenie)
// =============================================================================

function getAllVyhodnotenia() {
  return db.prepare('SELECT * FROM vyhodnotenie').all();
}

// =============================================================================
// AUDIT LOGS
// =============================================================================

function logAudit(akcia, autor, detaily) {
  db.prepare(`
    INSERT INTO audit_logs (akcia, autor, detaily)
    VALUES (?, ?, ?)
  `).run(akcia, autor, detaily);
}

function getAuditLogs(limit = 50) {
  return db.prepare(`
    SELECT * FROM audit_logs 
    ORDER BY id DESC 
    LIMIT ?
  `).all(limit);
}

// =============================================================================
// ŽIVÝ PREHĽAD DATABÁZY V REÁLNOM ČASE (Real-Time DB Inspector)
// =============================================================================

function getLiveDatabaseSnapshot() {
  const users = getAllUsers();
  const hrAdmin = getAllHrAdmins();
  const interview = getAllInterviews();
  const vyhodnotenie = getAllVyhodnotenia();
  const auditLogs = getAuditLogs(100);
  const interviewAnalyza = db.prepare('SELECT * FROM interview_analyza ORDER BY id DESC').all();

  // Štatistiky
  const stats = {
    totalUsers: users.length,
    totalHrAdmins: hrAdmin.length,
    totalInterviews: interview.length,
    postupili: interview.filter(i => i.vyhodnotenie === 'postupil').length,
    nepostupili: interview.filter(i => i.vyhodnotenie === 'nepostupil').length,
    rozpracovane: interview.filter(i => i.vyhodnotenie === 'rozpracovane').length,
    neprebehlo: interview.filter(i => i.vyhodnotenie === 'neprebehlo').length,
    dbPath: DB_PATH,
    dbSize: fs.existsSync(DB_PATH) ? `${(fs.statSync(DB_PATH).size / 1024).toFixed(1)} KB` : '0 KB',
    timestamp: new Date().toISOString(),
  };

  return {
    tables: {
      users,
      hr_admin: hrAdmin,
      interview,
      vyhodnotenie,
      interview_analyza: interviewAnalyza,
      audit_logs: auditLogs,
    },
    stats,
  };
}

function getInterviewsNeedingReminder() {
  const rows = db.prepare(`
    SELECT i.*, u.username as hr_username, u.mail as hr_mail
    FROM interview i
    JOIN users u ON i.hr_id = u.id
    WHERE (i.reminder_sent = 0 OR i.reminder_sent IS NULL)
      AND i.vyhodnotenie NOT IN ('nepostupil', 'postupil', 'zruseny')
    ORDER BY i.datum ASC
  `).all();

  const now = new Date();

  return rows.filter(item => {
    if (!item.datum) return false;
    const itemDate = new Date(item.datum.replace(' ', 'T'));
    if (isNaN(itemDate.getTime())) return false;

    const diffMs = itemDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // Pohovor už prebehol alebo začína o menej ako 10 minút - neposielame "zajtra o..."
    if (diffMs < 10 * 60 * 1000) return false;

    // Musí byť v časovom horizonte maximálne 26 hodín dopredu
    if (diffHours > 26) return false;

    // Kontrola kalendárneho dňa "zajtra" (alebo do 24 hodín)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isTomorrowCalendarDay = (
      itemDate.getFullYear() === tomorrow.getFullYear() &&
      itemDate.getMonth() === tomorrow.getMonth() &&
      itemDate.getDate() === tomorrow.getDate()
    );

    // Splnené, ak je pohovor zajtra a je to v okne 26 hodín, alebo ak diffHours <= 24 a diffHours >= 0.5
    return (isTomorrowCalendarDay && diffHours <= 26) || (diffHours <= 24 && diffHours >= 0.5);
  });
}

function markReminderSent(id, author = 'system') {
  const existing = db.prepare('SELECT id, meno_respondenta, mail_respondenta, datum, link_meeting, titul_pozicia FROM interview WHERE id = ?').get(id);
  if (!existing) return false;

  db.prepare(`
    UPDATE interview
    SET reminder_sent = 1,
        reminder_sent_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(id);

  logAudit(
    'EMAIL_PRIPOMIENKA_ODOSLANA',
    author,
    `Pripomienka na online pohovor "${existing.titul_pozicia}" (termín: ${existing.datum}) bola úspešne odoslaná na email ${existing.meno_respondenta} (${existing.mail_respondenta}). Link: ${existing.link_meeting}`
  );

  notifyDbChange('INTERVIEW_REMINDER_SENT', { interviewId: id, datum: existing.datum });
  return true;
}

module.exports = {
  db,
  dbEvents,
  initDatabase,
  hashPassword,
  generateSalt,
  verifyPassword,
  authenticateUser,
  createUser,
  getAllUsers,
  getUserByEmail,
  deleteUser,
  getAllHrAdmins,
  getAllInterviews,
  getInterviewById,
  getInterviewByRoomId,
  getInterviewsByHr,
  parseEmailList,
  buildPersonalizedMeetingLink,
  resolveMeetingParticipant,
  generateInterviewInvitation,
  generateColleagueInvitation,
  generateInterviewReminder,
  generateInterviewReschedule,
  generateInterviewCancellation,
  getInterviewsNeedingReminder,
  markReminderSent,
  generateIcsContent,
  createInterview,
  addInterviewColleague,
  rescheduleInterview,
  cancelInterview,
  updateInterviewEvaluation,
  deleteInterview,
  getAllVyhodnotenia,
  logAudit,
  getAuditLogs,
  getLiveDatabaseSnapshot,
  createSession,
  getSessionUser,
  deleteSession,
};

