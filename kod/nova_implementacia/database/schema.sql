-- =============================================================================
-- Databázová schéma: Analýza Online Pohovorov
-- Bakalárska práca - FIIT STU Bratislava
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- 1. TABUĽKA: vyhodnotenie (Enum číselník výsledkov pohovoru)
-- Hodnoty: rozpracovane, neprebehlo, postupil, nepostupil
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vyhodnotenie (
    kod TEXT PRIMARY KEY,
    nazov TEXT NOT NULL,
    farba TEXT NOT NULL,
    popis TEXT
);

-- -----------------------------------------------------------------------------
-- 2. TABUĽKA: users (Používatelia, HR personalisti a Superadmini)
-- Zahashované heslá so saltom (scrypt), osobné údaje a ures_tag rola
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    meno TEXT NOT NULL,
    priezvisko TEXT NOT NULL,
    mail TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    ures_tag TEXT NOT NULL, -- napr. 'SUPERADMIN', 'HR_ADMIN'
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- -----------------------------------------------------------------------------
-- 3. TABUĽKA: hr_admin (Väzba na používateľa, štatistika pohovorov a termín)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    pocet_interviews INTEGER NOT NULL DEFAULT 0,
    datum_interview TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 4. TABUĽKA: interview (Zoznam pohovorov, kandidáti, linky a vyhodnotenie)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interview (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datum TEXT NOT NULL,
    hr_id INTEGER NOT NULL,
    meno_hr TEXT NOT NULL,
    meno_respondenta TEXT NOT NULL,
    mail_respondenta TEXT NOT NULL,
    link_meeting TEXT NOT NULL,
    room_id TEXT NOT NULL UNIQUE,
    titul_pozicia TEXT NOT NULL DEFAULT 'Pohovor',
    vyhodnotenie TEXT NOT NULL DEFAULT 'neprebehlo',
    poznamky TEXT,
    reminder_sent INTEGER NOT NULL DEFAULT 0,
    reminder_sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (hr_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (vyhodnotenie) REFERENCES vyhodnotenie(kod) ON UPDATE CASCADE
);

-- -----------------------------------------------------------------------------
-- 5. TABUĽKA: audit_logs (Živý auditný záznam operácií v systéme)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cas TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    akcia TEXT NOT NULL,
    autor TEXT NOT NULL,
    detaily TEXT
);

-- -----------------------------------------------------------------------------
-- 6. TABUĽKA: interview_analyza (Výsledky multimodálnej analýzy pohovoru)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interview_analyza (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    interview_id INTEGER NOT NULL UNIQUE,
    skore_pozornosti REAL DEFAULT 0.0,
    dominantna_emocia TEXT DEFAULT 'neutrálna',
    pocet_vyplnovych_slov INTEGER DEFAULT 0,
    stav_analyzy TEXT NOT NULL DEFAULT 'cakajuce',
    zaznam_cesta TEXT,
    vytvorene TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (interview_id) REFERENCES interview(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 7. TABUĽKA: sessions (Trvalé prihlasovacie relácie na 30 dní)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- Indexy pre rýchle vyhľadávanie
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_mail ON users(mail);
CREATE INDEX IF NOT EXISTS idx_interview_hr_id ON interview(hr_id);
CREATE INDEX IF NOT EXISTS idx_interview_datum ON interview(datum);
CREATE INDEX IF NOT EXISTS idx_interview_vyhodnotenie ON interview(vyhodnotenie);
CREATE INDEX IF NOT EXISTS idx_audit_logs_cas ON audit_logs(cas);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

