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
        const content = fs.readFileSync(envPath, 'utf8');
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
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (_) {}
  }
  return {};
}

function getEmailConfig() {
  const cfg = loadConfig();
  const emailCfg = cfg.email || {};

  const host = process.env.EMAIL_HOST || emailCfg.host || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT || emailCfg.port || '465', 10);
  const secure = process.env.EMAIL_SECURE !== undefined 
    ? process.env.EMAIL_SECURE === 'true' 
    : (emailCfg.secure !== undefined ? emailCfg.secure : (port === 465));

  const user = process.env.EMAIL_USER || emailCfg.user || 'oncall.noreply@gmail.com';
  let pass = process.env.EMAIL_PASS || emailCfg.pass || 'Captain99@';
  
  // Odstránenie medzier ak používateľ zadal Google App Password vo formáte "xxxx xxxx xxxx xxxx"
  if (typeof pass === 'string' && pass.replace(/\s+/g, '').length === 16 && !pass.includes('@')) {
    pass = pass.replace(/\s+/g, '');
  }

  const from = process.env.EMAIL_FROM || emailCfg.from || `"Automatická analýza pohovorov (FIIT STU)" <${user}>`;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
  };
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

async function sendInterviewConfirmation(interview) {
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

async function sendInterviewReminder(interview) {
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
// 3. Testovací email
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
  verifySmtp,
  sendInterviewConfirmation,
  sendInterviewReminder,
  sendTestEmail,
};
