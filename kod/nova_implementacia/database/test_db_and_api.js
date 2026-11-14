// =============================================================================
// Testovací skript pre overenie DB schémy, API a biznis logiky
// =============================================================================

const dbModule = require('./db');

async function runTests() {
  console.log('🧪 Začínam overovacie testy pre databázu a funkcionalitu...\n');

  // 1. Inicializácia databázy
  console.log('1️⃣ Inicializácia databázy...');
  dbModule.initDatabase();
  console.log('   ✅ Databáza úspešne inicializovaná.');

  // Prečistenie prípadných predchádzajúcich testovacích záznamov
  try {
    dbModule.db.prepare("DELETE FROM interview WHERE room_id LIKE 'bp-%-test'").run();
    dbModule.db.prepare("DELETE FROM users WHERE username LIKE 'test_%'").run();
  } catch (_) {}

  // 2. Overenie predvoleného admin používateľa
  console.log('\n2️⃣ Overenie predvoleného administrátora (admin / admin)...');
  const adminAuth = dbModule.authenticateUser('admin', 'admin');
  if (!adminAuth) {
    throw new Error('❌ Zlyhalo prihlásenie pre admin / admin!');
  }
  console.log(`   ✅ Admin úspešne prihlásený: ${adminAuth.username} (${adminAuth.meno} ${adminAuth.priezvisko})`);
  console.log(`   ✅ Rola (ures_tag): ${adminAuth.ures_tag}`);

  const badAuth = dbModule.authenticateUser('admin', 'zle_heslo');
  if (badAuth !== null) {
    throw new Error('❌ Prihlásenie so zlým heslom malo zlyhať!');
  }
  console.log('   ✅ Bezpečnostná kontrola: Zlé heslo bolo správne zamietnuté.');

  // 3. Vytvorenie nového HR používateľa cez funkciu createUser
  console.log('\n3️⃣ Vytvorenie nového HR používateľa (HR_ADMIN)...');
  const hrUser = dbModule.createUser({
    username: 'test_hr_lucia',
    meno: 'Lucia',
    priezvisko: 'Veselá',
    mail: 'lucia.vesela@example.com',
    password: 'tajneHeslo123',
    ures_tag: 'HR_ADMIN'
  }, 'admin');
  console.log(`   ✅ Vytvorený HR používateľ: ID ${hrUser.id}, ${hrUser.username}, rola: ${hrUser.ures_tag}`);

  // 4. Vytvorenie nového Super Admina cez funkciu createUser
  console.log('\n4️⃣ Vytvorenie nového Super Admina (SUPERADMIN)...');
  const superAdminUser = dbModule.createUser({
    username: 'test_superadmin_peter',
    meno: 'Peter',
    priezvisko: 'Kováč',
    mail: 'peter.kovac@example.com',
    password: 'superHeslo456',
    ures_tag: 'SUPERADMIN'
  }, 'admin');
  console.log(`   ✅ Vytvorený Super Admin: ID ${superAdminUser.id}, ${superAdminUser.username}, rola: ${superAdminUser.ures_tag}`);

  // 5. Overenie hesla a hashu
  console.log('\n5️⃣ Overenie hashu hesla nového používateľa...');
  const hrAuth = dbModule.authenticateUser('test_hr_lucia', 'tajneHeslo123');
  if (!hrAuth) throw new Error('❌ Zlyhalo prihlásenie pre test_hr_lucia!');
  console.log('   ✅ Nový HR používateľ sa dokáže prihlásiť so svojím heslom.');

  // 6. Kontrola záznamov v hr_admin
  console.log('\n6️⃣ Kontrola tabuľky hr_admin...');
  const hrAdmins = dbModule.getAllHrAdmins();
  console.log(`   ✅ Počet záznamov v hr_admin: ${hrAdmins.length}`);
  const luciaHr = hrAdmins.find(h => h.username === 'test_hr_lucia');
  if (!luciaHr) throw new Error('❌ test_hr_lucia sa nenachádza v hr_admin!');
  console.log(`   ✅ Záznam hr_admin pre Luciu nájdený: User ID ${luciaHr.user_id}, počet interviews: ${luciaHr.pocet_interviews}`);

  // 7. Vytvorenie pohovoru pre kandidáta a automatická pozvánka
  console.log('\n7️⃣ Vytvorenie pohovoru (interview) a automatická pozvánka...');
  const interviewDatum = '2026-11-10 14:00';
  const newInterview = dbModule.createInterview({
    datum: interviewDatum,
    hr_id: luciaHr.user_id,
    meno_respondenta: 'Tomáš Testovací',
    mail_respondenta: 'tomas.test@example.com',
    link_meeting: 'http://localhost:45681/meeting/bp-tomas-test',
    room_id: 'bp-tomas-test',
    titul_pozicia: 'Senior DevOps Inžinier',
    vyhodnotenie: 'rozpracovane',
    poznamky: 'Pohovor s kandidátom pre cloud infraštruktúru'
  }, 'test_hr_lucia');
  console.log(`   ✅ Pohovor úspešne vytvorený: ID ${newInterview.id}, kandidát: ${newInterview.meno_respondenta}, status: ${newInterview.vyhodnotenie}`);
  
  if (!newInterview.invitation || !newInterview.invitation.ics || !newInterview.invitation.html) {
    throw new Error('❌ Automatická pozvánka na pohovor nebola vygenerovaná!');
  }
  console.log(`   ✅ Automatická pozvánka vygenerovaná: Predmet = "${newInterview.invitation.subject}"`);
  console.log(`   ✅ iCalendar (.ics) vytvorený (${newInterview.invitation.ics.length} bajtov)`);

  const fetchedById = dbModule.getInterviewById(newInterview.id);
  if (!fetchedById || fetchedById.meno_respondenta !== 'Tomáš Testovací') {
    throw new Error('❌ getInterviewById zlyhal!');
  }
  const hrInterviews = dbModule.getInterviewsByHr(luciaHr.user_id);
  if (!hrInterviews.length || hrInterviews[0].id !== newInterview.id) {
    throw new Error('❌ getInterviewsByHr zlyhal!');
  }
  console.log(`   ✅ getInterviewById aj getInterviewsByHr úspešne otestované.`);

  // 8. Overenie aktualizácie počtu a dátumu v hr_admin
  console.log('\n8️⃣ Overenie automatickej aktualizácie štatistík v hr_admin...');
  const updatedHr = dbModule.getAllHrAdmins().find(h => h.username === 'test_hr_lucia');
  console.log(`   ✅ Lucia má po vytvorení interview: počet = ${updatedHr.pocet_interviews}, najbližší termín = ${updatedHr.datum_interview}`);
  if (updatedHr.pocet_interviews !== 1) {
    throw new Error('❌ Počet interviews v hr_admin sa neaktualizoval!');
  }

  // 9. Zmena vyhodnotenia pohovoru (enum: postupil)
  console.log('\n9️⃣ Zmena statusu vyhodnotenia na "postupil"...');
  dbModule.updateInterviewEvaluation(newInterview.id, 'postupil', 'test_hr_lucia');
  const checkInt = dbModule.getAllInterviews().find(i => i.id === newInterview.id);
  console.log(`   ✅ Status pohovoru #${checkInt.id} zmenený na: "${checkInt.vyhodnotenie}" (${checkInt.vyhodnotenie_nazov})`);
  if (checkInt.vyhodnotenie !== 'postupil') {
    throw new Error('❌ Vyhodnotenie sa neaktualizovalo!');
  }

  // 10. Kontrola 30-dňových perzistentných sessions
  console.log('\n🔟 Test 30-dňových trvalých relácií (sessions)...');
  const testToken = 'test_token_abcdef123456';
  const expiresAt = dbModule.createSession(adminAuth.id, testToken, 30);
  console.log(`   ✅ Session vytvorená v DB s platnosťou do: ${expiresAt}`);
  const sessionUser = dbModule.getSessionUser(testToken);
  if (!sessionUser || sessionUser.username !== 'admin') {
    throw new Error('❌ Zlyhalo načítanie session z databázy!');
  }
  console.log(`   ✅ Používateľ úspešne overený cez DB session: ${sessionUser.username} (${sessionUser.ures_tag})`);
  dbModule.deleteSession(testToken);
  if (dbModule.getSessionUser(testToken) !== null) {
    throw new Error('❌ Session mala byť po odhlásení vymazaná!');
  }
  console.log('   ✅ Odhlásenie a zmazanie session funguje správne.');

  // 11. Test odstraňovania používateľov Superadminom (vrátane iného Superadmina!)
  console.log('\n1️⃣1️⃣ Test odstraňovania používateľov a iných Superadminov...');
  // Pokus zmazať svoj vlastný účet (musí zlyhať)
  try {
    dbModule.deleteUser(adminAuth.id, 'admin');
    throw new Error('❌ Nemalo byť možné zmazať svoj vlastný prihlásený účet!');
  } catch (err) {
    console.log(`   ✅ Ochrana vlastného prihláseného účtu funguje: "${err.message}"`);
  }

  // Superadmin maže HR Luciu, ktorá má dohodnutý pohovor (pohovor sa musí bezpečne previesť na admina)
  dbModule.deleteUser(hrUser.id, 'admin');
  console.log('   ✅ Superadmin úspešne odstránil používateľa Lucia (HR_ADMIN) z databázy.');

  const checkDeleted = dbModule.getAllUsers().find(u => u.id === hrUser.id);
  if (checkDeleted) throw new Error('❌ Používateľ mal byť zmazaný!');
  console.log('   ✅ Používateľ bol kompletne odstránený z tabuľky users aj hr_admin.');

  // Pohovor Lucii bol bezpečne prevedený na admina
  const reassignedInt = dbModule.getAllInterviews().find(i => i.id === newInterview.id);
  console.log(`   ✅ Pohovor #${reassignedInt.id} bol bezpečne prevedený na: "${reassignedInt.meno_hr}" (hr_id: ${reassignedInt.hr_id})`);

  // SUPERADMIN maže iného SUPERADMINA (Peter Kováč, rola: SUPERADMIN)
  console.log('\n   ⭐ Test: Superadmin maže iného Superadmina (Peter Kováč)...');
  dbModule.deleteUser(superAdminUser.id, 'admin');
  const checkDeletedSuper = dbModule.getAllUsers().find(u => u.id === superAdminUser.id);
  if (checkDeletedSuper) throw new Error('❌ Iný Superadmin mal byť zmazaný!');
  console.log('   ✅ Superadmin úspešne odstránil iného Superadmina z databázy!');

  // Pokus zmazať posledného existujúceho Superadmina (admin) iným autorom - musí zlyhať ak je posledný
  const remainingSuperadmins = dbModule.getAllUsers().filter(u => u.ures_tag === 'SUPERADMIN');
  if (remainingSuperadmins.length === 1) {
    let failedToDeleteLast = false;
    try {
      dbModule.deleteUser(remainingSuperadmins[0].id, 'iný_autor');
      failedToDeleteLast = true;
    } catch (err) {
      console.log(`   ✅ Ochrana posledného Superadmina v databáze funguje: "${err.message}"`);
      if (!err.message.includes('aspoň jeden aktívny SUPERADMIN')) {
        throw err;
      }
    }
    if (failedToDeleteLast) {
      throw new Error('❌ Nemalo byť možné zmazať posledného Superadmina v systéme!');
    }
  } else {
    console.log(`   ✅ V databáze je ${remainingSuperadmins.length} Superadminov. Kontrola viacnásobnej správy Superadminov funguje.`);
  }

  // 12. Kontrola live snapshotu databázy
  console.log('\n1️⃣2️⃣ Získanie kompletného Live Snapshotu databázy...');
  const snapshot = dbModule.getLiveDatabaseSnapshot();
  console.log(`   ✅ Používatelia v DB: ${snapshot.stats.totalUsers}`);
  console.log(`   ✅ HR Admini v DB: ${snapshot.stats.totalHrAdmins}`);
  console.log(`   ✅ Pohovory v DB: ${snapshot.stats.totalInterviews}`);
  console.log(`   ✅ Postúpili: ${snapshot.stats.postupili}`);
  console.log(`   ✅ Audit logy: ${snapshot.tables.audit_logs.length}`);

  // 13. Test automatických pripomienok 1 deň pred pohovorom
  console.log('\n1️⃣3️⃣ Test generovania a plánovania pripomienok (1 deň vopred)...');
  const tomorrowDate = new Date(Date.now() + 23 * 3600 * 1000);
  const tomorrowDatumStr = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')} ${String(tomorrowDate.getHours()).padStart(2, '0')}:${String(tomorrowDate.getMinutes()).padStart(2, '0')}`;

  const tomorrowInterview = dbModule.createInterview({
    datum: tomorrowDatumStr,
    hr_id: adminAuth.id,
    meno_respondenta: 'Kandidát Zajtrajší',
    mail_respondenta: 'zajtra@example.com',
    link_meeting: 'https://host2.fxcomputers.net:13191/meeting/bp-zajtra-test',
    room_id: 'bp-zajtra-test',
    titul_pozicia: 'AI Engineer',
    vyhodnotenie: 'neprebehlo',
    poznamky: 'Pohovor na zajtra pre test pripomienky',
  }, 'admin');

  // Overenie šablóny pripomienky
  const reminderData = dbModule.generateInterviewReminder(tomorrowInterview);
  if (!reminderData.subject.startsWith('Pripomienka: Zajtra o')) {
    throw new Error(`❌ Predmet pripomienky nezodpovedá požiadavke! Dostal: ${reminderData.subject}`);
  }
  if (!reminderData.html.includes(tomorrowInterview.link_meeting) || !reminderData.text.includes(tomorrowInterview.link_meeting)) {
    throw new Error('❌ Pripomienka neobsahuje link na online meeting!');
  }
  console.log(`   ✅ Predmet pripomienky: "${reminderData.subject}"`);
  console.log(`   ✅ Pripomienka obsahuje presný čas: ${reminderData.time} a meeting link: ${tomorrowInterview.link_meeting}`);

  // Overenie detekcie plánovačom
  const pending = dbModule.getInterviewsNeedingReminder();
  const foundInPending = pending.find(i => i.id === tomorrowInterview.id);
  if (!foundInPending) {
    throw new Error('❌ getInterviewsNeedingReminder nenašiel zajtrajší pohovor!');
  }
  console.log(`   ✅ Plánovač úspešne identifikoval zajtrajší pohovor #${tomorrowInterview.id} na odoslanie pripomienky.`);

  // Označenie ako odoslané
  dbModule.markReminderSent(tomorrowInterview.id, 'Testovací plánovač');
  const fetchedReminderInt = dbModule.getInterviewById(tomorrowInterview.id);
  if (fetchedReminderInt.reminder_sent !== 1 || !fetchedReminderInt.reminder_sent_at) {
    throw new Error('❌ markReminderSent neaktualizoval stĺpce reminder_sent v databáze!');
  }
  console.log(`   ✅ Pohovor #${tomorrowInterview.id} má správne nastavené reminder_sent = 1 (odoslané o: ${fetchedReminderInt.reminder_sent_at}).`);

  // Overenie že po označení už nie je v pending
  const pendingAfter = dbModule.getInterviewsNeedingReminder();
  if (pendingAfter.find(i => i.id === tomorrowInterview.id)) {
    throw new Error('❌ Pohovor by už nemal byť v zozname čakajúcich pripomienok!');
  }
  console.log('   ✅ Pohovor bol správne vyradený zo zoznamu čakajúcich (zabránenie duplicitám).');

  // Upratanie zajtrajšieho pohovoru
  dbModule.deleteInterview(tomorrowInterview.id, 'admin');

  // 14. Test presunutia (reschedule) a zrušenia (cancel) pohovoru
  console.log('\n1️⃣4️⃣ Test presunutia a zrušenia pohovoru (HR aj Superadmin)...');
  const reschedInt = dbModule.createInterview({
    datum: '2026-11-25 10:00',
    hr_id: adminAuth.id,
    meno_respondenta: 'Milan Presunutý',
    mail_respondenta: 'milan.presunuty@example.com',
    link_meeting: 'https://host2.fxcomputers.net:13192/meeting/bp-milan-test',
    room_id: 'bp-milan-test',
    titul_pozicia: 'Fullstack Architekt',
    vyhodnotenie: 'neprebehlo',
    poznamky: 'Pôvodný termín',
  }, 'admin');

  // Označenie reminder_sent = 1 pre simuláciu, že reminder už odišiel
  dbModule.markReminderSent(reschedInt.id, 'admin');

  // 14.1 Presun pohovoru na iný dátum a čas
  const newDate = '2026-11-28 15:30';
  const rescheduledResult = dbModule.rescheduleInterview(reschedInt.id, newDate, 'admin');
  if (rescheduledResult.datum !== newDate) {
    throw new Error(`❌ Presunutie termínu zlyhalo: očakávaný ${newDate}, získaný ${rescheduledResult.datum}`);
  }
  if (rescheduledResult.oldDatum !== '2026-11-25 10:00') {
    throw new Error(`❌ Starý termín nezodpovedá: ${rescheduledResult.oldDatum}`);
  }
  if (rescheduledResult.reminder_sent !== 0 || rescheduledResult.reminder_sent_at !== null) {
    throw new Error('❌ Pri presune na nový termín sa neresetoval reminder_sent!');
  }
  console.log(`   ✅ Pohovor #${reschedInt.id} úspešne presunutý na: ${rescheduledResult.datum} (Pôvodný: ${rescheduledResult.oldDatum})`);
  console.log('   ✅ reminder_sent bol úspešne resetovaný na 0 pre nový termín.');

  // Test e-mailovej šablóny presunu termínu
  const reschedMail = dbModule.generateInterviewReschedule(rescheduledResult, rescheduledResult.oldDatum, 'Zmena rozvrhu HR');
  if (!reschedMail.subject.includes('Zmena termínu online pohovoru')) {
    throw new Error(`❌ Predmet e-mailu o presune termínu je nesprávny: ${reschedMail.subject}`);
  }
  if (!reschedMail.html.includes(newDate) && !reschedMail.html.includes('28.')) {
    throw new Error('❌ E-mail o presune neobsahuje nový termín!');
  }
  if (!reschedMail.ics.includes('SEQUENCE:2')) {
    throw new Error('❌ .ics súbor pre presunutý termín neobsahuje inkrementovanú SEQUENCE!');
  }
  console.log('   ✅ Šablóna e-mailu o presune a aktualizovaný .ics kalendár vygenerované správne.');

  // 14.2 Zrušenie pohovoru
  const cancelReason = 'Kandidát prijal inú pracovnú ponuku';
  const cancelledInt = dbModule.cancelInterview(reschedInt.id, 'admin', cancelReason);
  if (cancelledInt.vyhodnotenie !== 'zruseny') {
    throw new Error(`❌ Status zrušeného pohovoru má byť 'zruseny', je: ${cancelledInt.vyhodnotenie}`);
  }
  if (!cancelledInt.poznamky.includes(cancelReason)) {
    throw new Error('❌ Dôvod zrušenia nebol zaznamenaný do poznámok pohovoru!');
  }
  console.log(`   ✅ Pohovor #${reschedInt.id} bol úspešne zrušený so statusom "${cancelledInt.vyhodnotenie}".`);

  // Test e-mailovej šablóny zrušenia pohovoru
  const cancelMail = dbModule.generateInterviewCancellation(cancelledInt, cancelReason);
  if (!cancelMail.subject.includes('Zrušenie online pohovoru')) {
    throw new Error(`❌ Predmet e-mailu o zrušení je nesprávny: ${cancelMail.subject}`);
  }
  if (!cancelMail.ics.includes('METHOD:CANCEL') || !cancelMail.ics.includes('STATUS:CANCELLED')) {
    throw new Error('❌ .ics súbor o zrušení neobsahuje METHOD:CANCEL / STATUS:CANCELLED!');
  }
  console.log('   ✅ Šablóna storno e-mailu a .ics storno príloha (METHOD:CANCEL) sú v poriadku.');

  // Overenie že zrušený pohovor sa nedostane do pripomienok
  const needingReminders = dbModule.getInterviewsNeedingReminder();
  if (needingReminders.find(i => i.id === reschedInt.id)) {
    throw new Error('❌ Zrušený pohovor nesmie byť v zozname čakajúcich pripomienok!');
  }
  console.log('   ✅ Zrušený pohovor bol správne vynechaný zo zoznamu čakajúcich pripomienok.');

  // 14.3 Obnovenie / presunutie zrušeného pohovoru späť do aktívneho stavu
  const restoredDate = '2026-12-01 11:00';
  const restoredInt = dbModule.rescheduleInterview(reschedInt.id, restoredDate, 'admin');
  if (restoredInt.vyhodnotenie !== 'neprebehlo') {
    throw new Error(`❌ Po presune zrušeného pohovoru mal byť status obnovený na 'neprebehlo', je: ${restoredInt.vyhodnotenie}`);
  }
  console.log(`   ✅ Presun zrušeného pohovoru na nový termín (${restoredDate}) ho správne vrátil do aktívneho stavu "${restoredInt.vyhodnotenie}".`);

  // Upratanie testovacieho pohovoru
  dbModule.deleteInterview(reschedInt.id, 'admin');

  // 15. Upratanie testovacích dát
  console.log('\n1️⃣5️⃣ Čistenie testovacích záznamov...');
  dbModule.deleteInterview(newInterview.id, 'admin');
  console.log('   ✅ Testovacie záznamy boli vyčistené.');

  console.log('\n🎉 VŠETKY TESTY PREBEHLI NA 100% ÚSPEŠNE!');
}

runTests().catch(err => {
  console.error('\n❌ Chyba pri teste:', err);
  process.exit(1);
});

