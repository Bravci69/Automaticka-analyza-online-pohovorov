// =============================================================================
// E-mailové a kalendárové (.ics) šablóny pre online pohovory
// Bakalárska práca - FIIT STU Bratislava
// =============================================================================

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


function createEmailTemplates({ getUserByEmail } = {}) {
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


  return {
    formatDateTimeSk,
    escapeHtml,
    parseEmailList,
    buildPersonalizedMeetingLink,
    generateIcsContent,
    generateInterviewInvitation,
    generateColleagueInvitation,
    generateInterviewReminder,
    generateInterviewReschedule,
    generateInterviewCancellation,
  };
}

module.exports = {
  createEmailTemplates,
  formatDateTimeSk,
  escapeHtml,
  parseEmailList,
  buildPersonalizedMeetingLink,
  generateIcsContent,
};
