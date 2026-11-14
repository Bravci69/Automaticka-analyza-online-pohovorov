// =============================================================================
// Plánovač pripomienok pohovorov (Cron)
// Bakalárska práca - FIIT STU Bratislava
// Jakub Chmura
// =============================================================================

const dbModule = require('../database/db');
const mailer = require('./mailer');

let intervalTimer = null;
let isChecking = false;

/**
 * Prejde databázu a odošle pripomienky pre všetky pohovory,
 * ktoré sa uskutočnia zajtra (1 deň pred pohovorom) a ešte nemajú odoslanú pripomienku.
 */
async function checkAndSendReminders() {
  if (isChecking) return;
  isChecking = true;

  try {
    const pendingInterviews = dbModule.getInterviewsNeedingReminder();
    if (pendingInterviews && pendingInterviews.length > 0) {
      console.log(`[Plánovač pripomienok] 🔍 Nájdených ${pendingInterviews.length} pohovorov vyžadujúcich pripomienku 1 deň vopred.`);

      for (const interview of pendingInterviews) {
        try {
          console.log(`[Plánovač pripomienok] 📤 Odosielam pripomienku pre pohovor #${interview.id} uchádzačovi: ${interview.meno_respondenta} (${interview.mail_respondenta})`);

          const sendResult = await mailer.sendInterviewReminder(interview);

          if (sendResult.ok) {
            dbModule.markReminderSent(interview.id, 'Automatický plánovač pripomienok');
            console.log(`[Plánovač pripomienok] ✅ Pripomienka pre pohovor #${interview.id} úspešne zaznamenaná v databáze.`);
          } else {
            console.error(`[Plánovač pripomienok] ❌ Zlyhalo odoslanie pripomienky pre #${interview.id}: ${sendResult.error}`);
            dbModule.logAudit(
              'EMAIL_CHYBA_PRIPOMIENKY',
              'Automatický plánovač pripomienok',
              `Zlyhalo odoslanie pripomienky na pohovor #${interview.id} pre ${interview.meno_respondenta} (${interview.mail_respondenta}): ${sendResult.error}`
            );
          }
        } catch (innerErr) {
          console.error(`[Plánovač pripomienok] ❌ Výnimka pri spracovaní pohovoru #${interview.id}:`, innerErr);
        }
      }
    }
  } catch (err) {
    console.error('[Plánovač pripomienok] ❌ Chyba pri kontrole pohovorov:', err);
  } finally {
    isChecking = false;
  }
}

/**
 * Spustí periodický plánovač.
 * @param {number} intervalMs - Interval kontroly v milisekundách (predvolene 60 000 ms = 1 minúta)
 */
function startReminderScheduler(intervalMs = 60000) {
  // Prvá kontrola krátko po štarte (o 3 sekundy)
  setTimeout(() => {
    checkAndSendReminders().catch(err => {
      console.error('[Plánovač pripomienok] Chyba pri počiatočnej kontrole:', err);
    });
  }, 3000);

  // Periodická kontrola každú minútu
  if (intervalTimer) clearInterval(intervalTimer);
  intervalTimer = setInterval(() => {
    checkAndSendReminders().catch(err => {
      console.error('[Plánovač pripomienok] Chyba pri periodickej kontrole:', err);
    });
  }, intervalMs);

  console.log(`[Plánovač pripomienok] ⏰ Automatický plánovač 1-dňových pripomienok aktívny (kontrola každých ${intervalMs / 1000}s).`);
}

function stopReminderScheduler() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
    console.log('[Plánovač pripomienok] ⏹️ Plánovač zastavený.');
  }
}

module.exports = {
  checkAndSendReminders,
  startReminderScheduler,
  stopReminderScheduler,
};
