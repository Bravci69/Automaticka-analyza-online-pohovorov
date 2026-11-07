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
  ];

  const stmtEnum = db.prepare(`
    INSERT OR REPLACE INTO vyhodnotenie (kod, nazov, farba, popis)
    VALUES (?, ?, ?, ?)
  `);

  for (const item of enumValues) {
    stmtEnum.run(item.kod, item.nazov, item.farba, item.popis);
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
        'http://localhost:45681/meeting/bp-demo-pohovor',
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
  // Spočítanie počtu pohovorov
  const stats = db.prepare(`
    SELECT 
      COUNT(*) AS cnt,
      MIN(datum) AS najblizsi_datum
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

function generateIcsContent(interview) {
  const parseDate = (dStr) => {
    const d = new Date(dStr.replace(' ', 'T'));
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

  const cleanTitle = (interview.titul_pozicia || 'Online pohovor').replace(/[\r\n]+/g, ' ');
  const desc = `Pozvánka na online výberový pohovor na pozíciu ${cleanTitle}.\\n\\nKandidát: ${interview.meno_respondenta}\\nHR Konzultant: ${interview.meno_hr}\\n\\nPripojenie na pohovor:\\n${interview.link_meeting}\\n\\nSystém automatickej multimodálnej analýzy pohovorov (FIIT STU).`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FIIT STU//Automaticka analyza online pohovorov//SK',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Online pohovor: ${cleanTitle}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${interview.link_meeting}`,
    `URL:${interview.link_meeting}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Pripomienka: Online pohovor začína o 15 minút',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

function generateInterviewInvitation(interview) {
  const formattedDatum = formatDateTimeSk(interview.datum);
  const title = interview.titul_pozicia || 'Online pohovor';
  const subject = `Pozvánka na online pohovor: ${title} – FIIT STU`;

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
        <a href="${interview.link_meeting}" class="btn-join">Vstúpiť do virtuálnej miestnosti</a>
      </div>

      <p style="font-size: 13px; color: #475569; word-break: break-all;">
        Priamy odkaz na pripojenie k videohovoru:<br>
        <a href="${interview.link_meeting}" style="color: #7c3aed;">${interview.link_meeting}</a>
      </p>

      <div class="notice">
        <strong>💡 Technické inštrukcie:</strong><br>
        • Pripojte sa prosím 5 minút pred stanoveným časom.<br>
        • Pohovor prebieha priamo vo webovom prehliadači (Chrome, Firefox, Edge). Nie je potrebná inštalácia softvéru.<br>
        • Uistite sa, že máte funkčnú webkameru a mikrofón. Počas hovoru prebieha automatická analýza očného kontaktu a reči.
      </div>
    </div>
    <div class="email-footer">
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
${interview.link_meeting}

INŠTRUKCIE:
- Pripojte sa prosím 5 minút vopred cez webový prehliadač.
- Skontrolujte funkčnosť kamery a mikrofónu.
- Počas pohovoru bude prebiehať analýza reči a očného kontaktu.

S pozdravom,
${interview.meno_hr}
FIIT STU v Bratislave
  `.trim();

  const ics = generateIcsContent(interview);

  return {
    subject,
    recipientEmail: interview.mail_respondenta,
    recipientName: interview.meno_respondenta,
    hrName: interview.meno_hr,
    datum: interview.datum,
    formattedDatum,
    meetingUrl: interview.link_meeting,
    html: htmlContent,
    text: plainText,
    ics,
    sentAt: new Date().toISOString(),
    status: 'odoslana',
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
}, author = 'admin') {
  if (!datum || !hr_id || !meno_respondenta || !mail_respondenta || !link_meeting || !room_id) {
    throw new Error('Chýbajú povinné údaje pre pohovor!');
  }

  const hrUser = db.prepare('SELECT meno, priezvisko FROM users WHERE id = ?').get(hr_id);
  if (!hrUser) throw new Error('Zadaný HR používateľ neexistuje!');

  const meno_hr = `${hrUser.meno} ${hrUser.priezvisko}`;

  const res = db.prepare(`
    INSERT INTO interview (
      datum, hr_id, meno_hr, meno_respondenta, mail_respondenta,
      link_meeting, room_id, titul_pozicia, vyhodnotenie, poznamky
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    poznamky
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
    `Vytvorený pohovor "${titul_pozicia || 'Pohovor'}" pre kandidáta "${meno_respondenta}" (HR: ${meno_hr}, Kód: ${room_id})`
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
  deleteUser,
  getAllHrAdmins,
  getAllInterviews,
  getInterviewById,
  getInterviewByRoomId,
  getInterviewsByHr,
  generateInterviewInvitation,
  generateIcsContent,
  createInterview,
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

