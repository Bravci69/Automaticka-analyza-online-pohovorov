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
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('Používateľ neexistuje');
  if (user.username === 'admin') throw new Error('Predvoleného superadmina nie je možné zmazať!');

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  logAudit('ZMAZANIE_POUZIVATELA', author, `Používateľ "${user.username}" (ID: ${userId}) bol zmazaný`);
  notifyDbChange('USER_DELETED', { userId, username: user.username });
  return true;
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

function getInterviewByRoomId(roomId) {
  return db.prepare(`
    SELECT 
      i.*,
      v.nazov AS vyhodnotenie_nazov,
      v.farba AS vyhodnotenie_farba,
      u.meno AS hr_meno,
      u.priezvisko AS hr_priezvisko
    FROM interview i
    LEFT JOIN vyhodnotenie v ON v.kod = i.vyhodnotenie
    LEFT JOIN users u ON u.id = i.hr_id
    WHERE i.room_id = ?
  `).get(roomId);
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

  notifyDbChange('INTERVIEW_CREATED', { interviewId, room_id, meno_respondenta });

  return {
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
  getInterviewByRoomId,
  createInterview,
  updateInterviewEvaluation,
  deleteInterview,
  getAllVyhodnotenia,
  getAuditLogs,
  getLiveDatabaseSnapshot,
};

