// =============================================================================
// E-mailový modul: Automatické odosielanie pozvánok a pripomienok na pohovor
// Bakalárska práca - FIIT STU Bratislava
// Jakub Chmura
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  // Ak nodemailer nie je k dispozícii lokálne, zaloguje sa upozornenie
  console.warn('[Mailer] Knižnica nodemailer nie je nainštalovaná. Pre inštaláciu: npm install nodemailer');
}

const dbModule = require('../database/db');

// Načítanie .env súboru ak existuje
function loadEnv() {
  const envPaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'kod/nova_implementacia/server/.env'),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        let content = fs.readFileSync(envPath, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.substring(0, idx).trim();
            const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (_) {}
      break;
    }
  }
}
loadEnv();

// Načítanie konfigurácie z config.json
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
        let content = fs.readFileSync(p, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        return JSON.parse(content);
      }
    } catch (_) {}
  }
  return {};
}

function getEmailConfig() {
  const cfg = loadConfig();
  const emailCfg = cfg.email || {};

  const host = emailCfg.host || process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(emailCfg.port || process.env.EMAIL_PORT || '465', 10);
  const secure = emailCfg.secure !== undefined 
    ? emailCfg.secure 
    : (process.env.EMAIL_SECURE !== undefined ? process.env.EMAIL_SECURE === 'true' : (port === 465));

  const user = emailCfg.user || process.env.EMAIL_USER || 'oncall.noreply@gmail.com';
  let pass = emailCfg.pass || process.env.EMAIL_PASS || 'Captain99@';
  
  // Odstránenie medzier ak používateľ zadal Google App Password vo formáte "xxxx xxxx xxxx xxxx"
  if (typeof pass === 'string') {
    pass = pass.trim();
    if (pass.replace(/\s+/g, '').length === 16 && !pass.includes('@')) {
      pass = pass.replace(/\s+/g, '');
    }
  }

  const from = emailCfg.from || process.env.EMAIL_FROM || `"Automatická analýza pohovorov (FIIT STU)" <${user}>`;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
  };
}

function updateEmailConfig({ user, pass }) {
  const configPath = path.join(__dirname, 'config.json');
  let current = {};
  try {
    if (fs.existsSync(configPath)) {
      let raw = fs.readFileSync(configPath, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      current = JSON.parse(raw);
    }
  } catch (_) {}

  current.email = current.email || {};
  if (user) {
    current.email.user = user.trim();
    process.env.EMAIL_USER = user.trim();
  }
  if (pass) {
    let cleanPass = pass.trim();
    if (cleanPass.replace(/\s+/g, '').length === 16 && !cleanPass.includes('@')) {
      cleanPass = cleanPass.replace(/\s+/g, '');
    }
    current.email.pass = cleanPass;
    process.env.EMAIL_PASS = cleanPass;
  }
  fs.writeFileSync(configPath, JSON.stringify(current, null, 2), 'utf8');

  // Aktualizácia .env súboru ak existuje
  const envPath = path.join(__dirname, '.env');
  try {
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      if (pass) {
        if (/^EMAIL_PASS=.*/m.test(envContent)) {
          envContent = envContent.replace(/^EMAIL_PASS=.*/m, `EMAIL_PASS=${current.email.pass}`);
        } else {
          envContent += `\nEMAIL_PASS=${current.email.pass}`;
        }
      }
      if (user) {
        if (/^EMAIL_USER=.*/m.test(envContent)) {
          envContent = envContent.replace(/^EMAIL_USER=.*/m, `EMAIL_USER=${current.email.user}`);
        } else {
          envContent += `\nEMAIL_USER=${current.email.user}`;
        }
      }
    } else {
      envContent = `EMAIL_USER=${current.email.user || 'oncall.noreply@gmail.com'}\nEMAIL_PASS=${current.email.pass}\n`;
    }
    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
  } catch (_) {}

  return getEmailConfig();
}

function createTransporter() {
  if (!nodemailer) {
    throw new Error('Knižnica nodemailer nie je dostupná. Spustite: npm install nodemailer');
  }

  const cfg = getEmailConfig();

  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

// =============================================================================
// Overenie SMTP pripojenia
// =============================================================================

async function verifySmtp() {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return { ok: true, message: 'SMTP spojenie a autentifikácia sú v poriadku.' };
  } catch (err) {
    let tip = '';
    if (err.message && err.message.includes('BadCredentials')) {
      tip = ' Google vyžaduje namiesto bežného hesla 16-miestne Heslo aplikácie (App Password) vygenerované na myaccount.google.com -> Zabezpečenie.';
    }
    return { ok: false, error: err.message + tip };
  }
}

// =============================================================================
// 1. Odoslanie potvrdzujúcej pozvánky pri naplánovaní pohovoru
// =============================================================================

async function sendInterviewConfirmation(interviewOrId) {
  let interview = interviewOrId;
  if (typeof interviewOrId === 'number' || typeof interviewOrId === 'string') {
    interview = dbModule.getInterviewById(parseInt(interviewOrId, 10));
  }
  if (!interview) {
    return { ok: false, error: 'Pohovor nebol nájdený v databáze.' };
  }
  const cfg = getEmailConfig();
  const invitation = dbModule.generateInterviewInvitation(interview);

  const mailOptions = {
    from: cfg.from,
    to: interview.mail_respondenta,
    subject: invitation.subject,
    text: invitation.text,
    html: invitation.html,
    attachments: [
      {
        filename: `pohovor-${interview.room_id || interview.id}.ics`,
        content: invitation.ics,
        contentType: 'text/calendar; charset=utf-8; method=REQUEST',
      },
    ],
  };

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Mailer] ✅ Potvrdzujúci e-mail na pohovor #${interview.id} úspešne odoslaný na: ${interview.mail_respondenta} (MessageId: ${info.messageId})`);

    dbModule.logAudit(
      'EMAIL_POZVANKA_ODOSLANA',
      'Mailer',
      `Potvrdzujúci e-mail s pozvánkou na pohovor "${interview.titul_pozicia}" úspešne odoslaný uchádzačovi ${interview.meno_respondenta} (${interview.mail_respondenta}). Link: ${interview.link_meeting}`
    );

    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Mailer] ❌ Chyba pri odosielaní potvrdzujúceho e-mailu na ${interview.mail_respondenta}:`, err.message);

    let extraNote = '';
    if (err.message && err.message.includes('BadCredentials')) {
      extraNote = ' (Google vyžaduje Heslo aplikácie / App Password)';
      console.warn(`[Mailer] ⚠️ UPOZORNENIE: Účet ${cfg.user} vyžaduje 16-miestne Heslo aplikácie pre odosielanie cez SMTP.`);
    }

    dbModule.logAudit(
      'EMAIL_CHYBA',
      'Mailer',
      `Nepodarilo sa odoslať potvrdzujúci e-mail na ${interview.mail_respondenta}: ${err.message}${extraNote}`
    );

    return { ok: false, error: err.message + extraNote };
  }
}

// =============================================================================
// 2. Odoslanie pripomienky 1 deň pred online pohovorom
// =============================================================================

async function sendInterviewReminder(interviewOrId) {
  let interview = interviewOrId;
  if (typeof interviewOrId === 'number' || typeof interviewOrId === 'string') {
    interview = dbModule.getInterviewById(parseInt(interviewOrId, 10));
  }
  if (!interview) {
    return { ok: false, error: 'Pohovor nebol nájdený v databáze.' };
  }
  const cfg = getEmailConfig();
  const reminder = dbModule.generateInterviewReminder(interview);

  const mailOptions = {
    from: cfg.from,
    to: interview.mail_respondenta,
    subject: reminder.subject,
    text: reminder.text,
    html: reminder.html,
    attachments: [
      {
        filename: `pripomienka-${interview.room_id || interview.id}.ics`,
        content: reminder.ics,
        contentType: 'text/calendar; charset=utf-8; method=REQUEST',
      },
    ],
  };

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Mailer] ✅ Pripomienkový e-mail pre pohovor #${interview.id} (zajtra o ${reminder.time}) odoslaný na: ${interview.mail_respondenta} (MessageId: ${info.messageId})`);

    return { ok: true, messageId: info.messageId, reminderTime: reminder.time };
  } catch (err) {
    console.error(`[Mailer] ❌ Chyba pri odosielaní pripomienky na ${interview.mail_respondenta}:`, err.message);

    let extraNote = '';
    if (err.message && err.message.includes('BadCredentials')) {
      extraNote = ' (Google vyžaduje Heslo aplikácie / App Password)';
    }

    return { ok: false, error: err.message + extraNote };
  }
}

// =============================================================================
// 3. Odoslanie e-mailu pri zmene termínu pohovoru (presunutie)
// =============================================================================

async function sendInterviewRescheduled(interviewOrId, oldDatum, reason = '') {
  let interview = interviewOrId;
  if (typeof interviewOrId === 'number' || typeof interviewOrId === 'string') {
    interview = dbModule.getInterviewById(parseInt(interviewOrId, 10));
  }
  if (!interview) {
    return { ok: false, error: 'Pohovor nebol nájdený v databáze.' };
  }
  const cfg = getEmailConfig();
  const rescheduled = dbModule.generateInterviewReschedule(interview, oldDatum, reason);

  const mailOptions = {
    from: cfg.from,
    to: interview.mail_respondenta,
    subject: rescheduled.subject,
    text: rescheduled.text,
    html: rescheduled.html,
    attachments: [
      {
        filename: `novy-termin-${interview.room_id || interview.id}.ics`,
        content: rescheduled.ics,
        contentType: 'text/calendar; charset=utf-8; method=REQUEST',
      },
    ],
  };

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Mailer] ✅ E-mail o presune termínu pohovoru #${interview.id} odoslaný na: ${interview.mail_respondenta} (MessageId: ${info.messageId})`);

    dbModule.logAudit(
      'EMAIL_PRESUN_ODOSLANY',
      'Mailer',
      `E-mail s novým termínom "${interview.datum}" pohovoru "${interview.titul_pozicia}" úspešne odoslaný uchádzačovi ${interview.meno_respondenta} (${interview.mail_respondenta}).`
    );

    return { ok: true, messageId: info.messageId, newDatum: interview.datum };
  } catch (err) {
    console.error(`[Mailer] ❌ Chyba pri odosielaní e-mailu o presune termínu na ${interview.mail_respondenta}:`, err.message);
    return { ok: false, error: err.message };
  }
}

// =============================================================================
// 4. Odoslanie e-mailu pri zrušení pohovoru
// =============================================================================

async function sendInterviewCancelled(interviewOrId, reason = '') {
  let interview = interviewOrId;
  if (typeof interviewOrId === 'number' || typeof interviewOrId === 'string') {
    interview = dbModule.getInterviewById(parseInt(interviewOrId, 10));
  }
  if (!interview) {
    return { ok: false, error: 'Pohovor nebol nájdený v databáze.' };
  }
  const cfg = getEmailConfig();
  const cancelled = dbModule.generateInterviewCancellation(interview, reason);

  const mailOptions = {
    from: cfg.from,
    to: interview.mail_respondenta,
    subject: cancelled.subject,
    text: cancelled.text,
    html: cancelled.html,
    attachments: [
      {
        filename: `zrusenie-${interview.room_id || interview.id}.ics`,
        content: cancelled.ics,
        contentType: 'text/calendar; charset=utf-8; method=CANCEL',
      },
    ],
  };

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Mailer] ✅ E-mail o zrušení pohovoru #${interview.id} odoslaný na: ${interview.mail_respondenta} (MessageId: ${info.messageId})`);

    dbModule.logAudit(
      'EMAIL_ZRUSENIE_ODOSLANE',
      'Mailer',
      `E-mail o zrušení pohovoru "${interview.titul_pozicia}" úspešne odoslaný uchádzačovi ${interview.meno_respondenta} (${interview.mail_respondenta}).`
    );

    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Mailer] ❌ Chyba pri odosielaní e-mailu o zrušení pohovoru na ${interview.mail_respondenta}:`, err.message);
    return { ok: false, error: err.message };
  }
}

// =============================================================================
// 5. Testovací email
// =============================================================================

async function sendTestEmail(toEmail) {
  const cfg = getEmailConfig();
  const nowStr = new Date().toLocaleString('sk-SK');

  const mailOptions = {
    from: cfg.from,
    to: toEmail || cfg.user,
    subject: 'Testovacia správa – Automatická analýza online pohovorov FIIT STU',
    text: `Dobrý deň,\n\ntoto je overovací test odosielania e-mailov zo servera.\nČas odoslania: ${nowStr}\nOdosielateľ: ${cfg.user}\n\nSystém funguje správne.`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; background: #f8fafc; border-radius: 8px;">
        <h2 style="color: #7c3aed; margin-top: 0;">Test odosielania e-mailov úspešný</h2>
        <p>Systém správy a automatickej analýzy online pohovorov FIIT STU úspešne odoslal testovaciu správu.</p>
        <p><strong>Čas testu:</strong> ${nowStr}<br><strong>Odosielateľ:</strong> ${cfg.user}</p>
      </div>
    `,
  };

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail(mailOptions);
    return { ok: true, messageId: info.messageId, to: mailOptions.to };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getEmailConfig,
  updateEmailConfig,
  verifySmtp,
  sendInterviewConfirmation,
  sendInterviewReminder,
  sendInterviewRescheduled,
  sendInterviewCancelled,
  sendTestEmail,
};
