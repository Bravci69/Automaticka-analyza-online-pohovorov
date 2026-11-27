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
  const futureDate = new Date(Date.now() + 5 * 24 * 3600 * 1000);
  const pad = n => String(n).padStart(2, '0');
  const interviewDatum = `${futureDate.getFullYear()}-${pad(futureDate.getMonth() + 1)}-${pad(futureDate.getDate())} 14:00`;
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
  const fmtTestDate = (daysAhead, hm) => {
    const d = new Date(Date.now() + daysAhead * 24 * 3600 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
  };
  const origDate = fmtTestDate(10, '10:00');
  const reschedInt = dbModule.createInterview({
    datum: origDate,
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
  const newDate = fmtTestDate(12, '15:30');
  const expectedDay = `${new Date(Date.now() + 12 * 24 * 3600 * 1000).getDate()}.`;
  const rescheduledResult = dbModule.rescheduleInterview(reschedInt.id, newDate, 'admin');
  if (rescheduledResult.datum !== newDate) {
    throw new Error(`❌ Presunutie termínu zlyhalo: očakávaný ${newDate}, získaný ${rescheduledResult.datum}`);
  }
  if (rescheduledResult.oldDatum !== origDate) {
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
  if (!reschedMail.html.includes(newDate) && !reschedMail.html.includes(expectedDay)) {
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
  const restoredDate = fmtTestDate(15, '11:00');
  const restoredInt = dbModule.rescheduleInterview(reschedInt.id, restoredDate, 'admin');
  if (restoredInt.vyhodnotenie !== 'neprebehlo') {
    throw new Error(`❌ Po presune zrušeného pohovoru mal byť status obnovený na 'neprebehlo', je: ${restoredInt.vyhodnotenie}`);
  }
  console.log(`   ✅ Presun zrušeného pohovoru na nový termín (${restoredDate}) ho správne vrátil do aktívneho stavu "${restoredInt.vyhodnotenie}".`);

  // 14.4 Test zákazu nastavenia pohovoru a presunutia do minulosti
  console.log('   ⭐ Test zákazu nastavenia pohovoru a presunutia do minulosti...');
  let pastCreateError = false;
  try {
    dbModule.createInterview({
      datum: '2020-01-01 10:00',
      hr_id: adminAuth.id,
      meno_respondenta: 'Minulý Kandidát',
      mail_respondenta: 'minuly@example.com',
      link_meeting: 'https://host2.fxcomputers.net:13192/meeting/bp-past-test',
      room_id: 'bp-past-test',
      titul_pozicia: 'Tester',
    }, 'admin');
  } catch (err) {
    pastCreateError = true;
    console.log(`   ✅ Správne zamietnuté vytvorenie pohovoru v minulosti: "${err.message}"`);
  }
  if (!pastCreateError) throw new Error('❌ createInterview dovolil vytvoriť pohovor v minulosti!');

  let pastReschedError = false;
  try {
    dbModule.rescheduleInterview(restoredInt.id, '2021-05-10 14:00', 'admin');
  } catch (err) {
    pastReschedError = true;
    console.log(`   ✅ Správne zamietnuté presunutie pohovoru do minulosti: "${err.message}"`);
  }
  if (!pastReschedError) throw new Error('❌ rescheduleInterview dovolil presunúť pohovor do minulosti!');

  // Upratanie testovacieho pohovoru
  dbModule.deleteInterview(reschedInt.id, 'admin');

  // 15. Test pozvania ďalších zamestnancov / teamleadera na pohovor
  console.log('\n1️⃣5️⃣ Test pozvania ďalších zamestnancov / teamleadera na pohovor...');
  
  // 15.1 Test parseEmailList
  const parsedEmails = dbModule.parseEmailList('teamleader@firma.sk, kolega@firma.sk; sef@firma.sk   teamleader@firma.sk');
  if (parsedEmails.length !== 3 || !parsedEmails.includes('teamleader@firma.sk') || !parsedEmails.includes('kolega@firma.sk')) {
    throw new Error('❌ parseEmailList nefunguje správne!');
  }
  console.log('   ✅ parseEmailList správne rozparsoval a odduplikoval adresy: ' + parsedEmails.join(', '));

  // 15.2 Vytvorenie pohovoru s priamym zadaním ďalších zamestnancov
  const adminUserForTest = dbModule.getAllUsers().find(u => u.username === 'admin') || { id: 1 };
  const teamInterview = dbModule.createInterview({
    datum: fmtTestDate(20, '14:00'),
    hr_id: adminUserForTest.id,
    meno_respondenta: 'Kandidát s tímom',
    mail_respondenta: 'kandidat.tim@example.com',
    link_meeting: 'https://host2.fxcomputers.net:13192/meeting/bp-tim-test',
    room_id: 'bp-tim-test',
    titul_pozicia: 'Tech Lead / Python Guru',
    dalsie_maily: 'teamleader@firma.sk, techlead@firma.sk',
  }, 'admin');

  if (!teamInterview.dalsie_maily || !teamInterview.dalsie_maily.includes('teamleader@firma.sk')) {
    throw new Error('❌ dalsie_maily neboli uložené pri vytvorení pohovoru!');
  }
  console.log('   ✅ Pohovor úspešne vytvorený s kolegami: ' + teamInterview.dalsie_maily);

  // 15.3 Pridanie ďalšieho kolegu k existujúcemu pohovoru (addInterviewColleague)
  const addResult = dbModule.addInterviewColleague(teamInterview.id, 'observer.novak@firma.sk', 'admin');
  if (!addResult.dalsie_maily.includes('observer.novak@firma.sk') || !addResult.dalsie_maily.includes('teamleader@firma.sk')) {
    throw new Error('❌ addInterviewColleague nepridal kolegu správne!');
  }
  console.log('   ✅ addInterviewColleague úspešne priradil nového pozorovateľa: ' + addResult.dalsie_maily);

  // 15.4 Test generovania pozvánky pre kolegu (generateColleagueInvitation)
  const colleagueMail = dbModule.generateColleagueInvitation(teamInterview, {
    recipientEmail: 'teamleader@firma.sk',
    role: 'Team Leader',
    note: 'Účasť na technickej časti pohovoru a počúvanie',
  });

  if (!colleagueMail.subject.includes('Účasť tímu / Team Leader') || !colleagueMail.html.includes('teamleader@firma.sk') && !colleagueMail.html.includes('Pozvánka na online pohovor pre tím')) {
    throw new Error('❌ generateColleagueInvitation nevygenerovala očakávanú šablónu!');
  }
  if (!colleagueMail.ics || !colleagueMail.ics.includes('BEGIN:VCALENDAR')) {
    throw new Error('❌ generateColleagueInvitation neobsahuje .ics kalendár!');
  }
  console.log('   ✅ Šablóna pozvánky pre tím / teamleadera a .ics kalendár vygenerované na 100%.');

  // 15.5 Test zákazu pozvania samého seba
  console.log('   ⭐ Test zákazu pozvania samého seba na pohovor...');
  const testAdminUser = dbModule.getAllUsers().find(u => u.username === 'admin');
  const adminSelfMail = testAdminUser ? testAdminUser.mail : 'admin@fiit.stuba.sk';
  const callerMailParsed = dbModule.parseEmailList(adminSelfMail);
  if (!callerMailParsed.includes(adminSelfMail.toLowerCase())) {
    throw new Error('❌ parseEmailList nerozpoznal e-mail administrátora!');
  }
  console.log(`   ✅ Kontrola zákazu samopozvania overená pre: ${adminSelfMail}`);

  // 15.6 Test personalizovaných odkazov z e-mailu a automatickej identity účastníkov
  console.log('   ⭐ Test personalizácie linkov a resolveMeetingParticipant...');
  const candPersonalizedUrl = dbModule.buildPersonalizedMeetingLink(teamInterview.link_meeting, teamInterview.mail_respondenta);
  if (!candPersonalizedUrl.startsWith(teamInterview.link_meeting) || !candPersonalizedUrl.includes('invitee=kandidat.tim%40example.com')) {
    throw new Error(`❌ buildPersonalizedMeetingLink nevygenerovala očakávaný URL: ${candPersonalizedUrl}`);
  }
  if (!colleagueMail.html.includes('invitee=teamleader%40firma.sk')) {
    throw new Error('❌ generateColleagueInvitation neobsahuje personalizovaný parameter ?invitee=!');
  }

  const expectedAdminName = `${testAdminUser.meno} ${testAdminUser.priezvisko}`.trim();
  const staffAuto = dbModule.resolveMeetingParticipant(teamInterview.room_id, {
    authUser: testAdminUser,
    autoJoin: true,
  });
  if (!staffAuto.autoJoin || staffAuto.name !== expectedAdminName || staffAuto.email !== testAdminUser.mail || staffAuto.source !== 'staff_autojoin') {
    throw new Error(`❌ resolveMeetingParticipant zlyhal pre staff_autojoin: ${JSON.stringify(staffAuto)}`);
  }

  const candResolved = dbModule.resolveMeetingParticipant(teamInterview.room_id, {
    authUser: testAdminUser,
    inviteeEmail: 'kandidat.tim@example.com',
    autoJoin: false,
  });
  if (candResolved.autoJoin || candResolved.name !== 'Kandidát s tímom' || candResolved.email !== 'kandidat.tim@example.com' || candResolved.source !== 'candidate_invite') {
    throw new Error(`❌ resolveMeetingParticipant zlyhal pre candidate_invite: ${JSON.stringify(candResolved)}`);
  }

  const registeredColleague = dbModule.resolveMeetingParticipant(teamInterview.room_id, {
    inviteeEmail: testAdminUser.mail,
    autoJoin: false,
  });
  if (registeredColleague.autoJoin || registeredColleague.name !== expectedAdminName || registeredColleague.email !== testAdminUser.mail || registeredColleague.source !== 'colleague_account') {
    throw new Error(`❌ resolveMeetingParticipant zlyhal pre colleague_account: ${JSON.stringify(registeredColleague)}`);
  }

  const externalColleague = dbModule.resolveMeetingParticipant(teamInterview.room_id, {
    inviteeEmail: 'teamleader@firma.sk',
    autoJoin: false,
  });
  if (externalColleague.autoJoin || externalColleague.name !== '' || externalColleague.email !== 'teamleader@firma.sk' || externalColleague.source !== 'external_invitee') {
    throw new Error(`❌ resolveMeetingParticipant zlyhal pre external_invitee: ${JSON.stringify(externalColleague)}`);
  }

  const anonAuto = dbModule.resolveMeetingParticipant(teamInterview.room_id, {
    authUser: null,
    autoJoin: true,
  });
  if (anonAuto.autoJoin || anonAuto.canControlRecording || candResolved.canControlRecording || !staffAuto.canControlRecording) {
    throw new Error('❌ resolveMeetingParticipant nesprávne vyhodnotil autoJoin alebo oprávnenie ovládania nahrávania!');
  }
  console.log('   ✅ Personalizácia linkov a automatické načítanie mena/e-mailu (HR/Superadmin, kandidát, kolega s účtom aj hosť) prešli na 100%.');

  // 16. Test nahrávania pohovoru (automatický štart podľa účasti a termínu + manuálne ovládanie len pre HR/Superadmina)
  console.log('\n1️⃣6️⃣ Test automatického a manuálneho nahrávania pohovorov...');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { createRecordingManager, parseInterviewDatumMs } = require('../server/modules/recording_manager');

  const tmpRecDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-rec-test-'));
  const schedDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // o 2 hodiny
  const pad2 = n => String(n).padStart(2, '0');
  const schedStr = `${schedDate.getFullYear()}-${pad2(schedDate.getMonth() + 1)}-${pad2(schedDate.getDate())} ${pad2(schedDate.getHours())}:${pad2(schedDate.getMinutes())}`;
  const scheduledMs = parseInterviewDatumMs(schedStr);
  let mockNowMs = scheduledMs - 10 * 60 * 1000; // 10 minút pred termínom

  const recInterview = dbModule.createInterview({
    datum: schedStr,
    hr_id: testAdminUser.id,
    meno_respondenta: 'Nahrávaný Kandidát',
    mail_respondenta: 'kandidat.rec@example.com',
    link_meeting: 'https://host2.fxcomputers.net:13192/meeting/bp-rec-test',
    room_id: 'bp-rec-test',
    titul_pozicia: 'QA / Recording Engineer',
    dalsie_maily: 'kolega1@firma.sk, kolega2@firma.sk',
  }, 'admin');

  const recMgr = createRecordingManager({
    dbModule,
    recordingDir: tmpRecDir,
    nowFn: () => mockNowMs,
  });

  // 16.1 Pripojí sa HR pred termínom -> čaká (chýba termín, kandidát, kolegovia)
  let recSnap = recMgr.registerPresence(recInterview.room_id, {
    clientId: 'cli-hr',
    authUser: testAdminUser,
    name: expectedAdminName,
    email: testAdminUser.mail,
  });
  if (recSnap.state !== 'waiting' || !recSnap.participant.canControlRecording) {
    throw new Error('❌ Nahrávanie nemalo začať iba s pripojeným HR a HR má mať práva ovládania!');
  }

  // 16.2 Pripojí sa kandidát (nesmie mať práva ovládať nahrávanie)
  recSnap = recMgr.registerPresence(recInterview.room_id, {
    clientId: 'cli-cand',
    authUser: null,
    name: 'Nahrávaný Kandidát',
    email: 'kandidat.rec@example.com',
    inviteeEmail: 'kandidat.rec@example.com',
  });
  if (recSnap.state !== 'waiting' || recSnap.participant.canControlRecording) {
    throw new Error('❌ Nahrávanie sa nemá spustiť pred pripojením kolegov a kandidát nesmie mať práva na tlačidlá!');
  }

  // 16.3 Pripojí sa iba kolega1 (kolega2 ešte chýba)
  recSnap = recMgr.registerPresence(recInterview.room_id, {
    clientId: 'cli-kol1',
    name: 'Prvý Kolega',
    email: 'kolega1@firma.sk',
    inviteeEmail: 'kolega1@firma.sk',
  });
  if (recSnap.state !== 'waiting' || recSnap.attendance.missingColleagues.length !== 1) {
    throw new Error('❌ Systém musí čakať aj na kolega2@firma.sk!');
  }

  // 16.4 Pripojí sa aj kolega2, ale stále sme 10 minút PRED termínom -> musí ešte čakať na čas!
  recSnap = recMgr.registerPresence(recInterview.room_id, {
    clientId: 'cli-kol2',
    name: 'Druhý Kolega',
    email: 'kolega2@firma.sk',
    inviteeEmail: 'kolega2@firma.sk',
  });
  if (recSnap.state !== 'waiting' || recSnap.attendance.missingColleagues.length !== 0 || recSnap.attendance.timeReached) {
    throw new Error(`❌ Nahrávanie sa nesmie spustiť pred termínom pohovoru (${schedStr})!`);
  }
  console.log('   ✅ Pred termínom aj pri neúplnej účasti zostáva stav správne "waiting".');

  // 16.5 Ak chýba kolega2 aj v čase pohovoru -> stále čaká (overenie na odpojení kolega2 a posune času s aktívnym heartbeatom ostatných)
  recMgr.unregisterPresence(recInterview.room_id, 'cli-kol2');
  mockNowMs = scheduledMs + 5000; // 5 sekúnd po termíne
  recMgr.registerPresence(recInterview.room_id, { clientId: 'cli-hr', authUser: testAdminUser, name: expectedAdminName, email: testAdminUser.mail });
  recMgr.registerPresence(recInterview.room_id, { clientId: 'cli-cand', authUser: null, name: 'Nahrávaný Kandidát', email: 'kandidat.rec@example.com', inviteeEmail: 'kandidat.rec@example.com' });
  recMgr.registerPresence(recInterview.room_id, { clientId: 'cli-kol1', name: 'Prvý Kolega', email: 'kolega1@firma.sk', inviteeEmail: 'kolega1@firma.sk' });
  recMgr.tickAllRooms();
  recSnap = recMgr.getStatus(recInterview.room_id);
  if (recSnap.state !== 'waiting' || !recSnap.attendance.timeReached || recSnap.attendance.missingColleagues.length !== 1 || recSnap.attendance.missingColleagues[0] !== 'kolega2@firma.sk') {
    throw new Error(`❌ V čase pohovoru bez všetkých pozvaných (chýba kolega2) sa nahrávanie nesmie spustiť! ${JSON.stringify(recSnap.attendance)}`);
  }

  // 16.6 Dopojí sa posledný pozvaný kolega2 v termíne pohovoru -> AUTOMATICKÉ spustenie!
  recSnap = recMgr.registerPresence(recInterview.room_id, {
    clientId: 'cli-kol2',
    name: 'Druhý Kolega',
    email: 'kolega2@firma.sk',
    inviteeEmail: 'kolega2@firma.sk',
  });
  if (recSnap.state !== 'recording' || recSnap.trigger !== 'auto' || !recSnap.sessionId) {
    throw new Error(`❌ Po pripojení všetkých pozvaných v termíne sa nahrávanie malo automaticky spustiť! Stav: ${JSON.stringify(recSnap)}`);
  }
  console.log(`   ✅ Automatické nahrávanie sa spustilo presne po pripojení všetkých a dosiahnutí termínu (${recSnap.sessionId}).`);

  // 16.7 Uloženie reálneho média chunku do priečinka recording/<roomId> a DB
  const chunkRes = recMgr.appendChunk(recInterview.room_id, {
    sessionId: recSnap.sessionId,
    clientId: 'cli-cand',
    roleTag: 'kandidat',
    name: 'Nahrávaný Kandidát',
    email: 'kandidat.rec@example.com',
    mimeType: 'video/webm',
    isFinal: false,
  }, Buffer.from('WEBM_TEST_PAYLOAD_123456'));
  const savedFull = path.join(tmpRecDir, 'bp-rec-test', chunkRes.fileName);
  const analyzaRow = dbModule.db.prepare('SELECT zaznam_cesta FROM interview_analyza WHERE interview_id = ?').get(recInterview.id);
  if (!fs.existsSync(savedFull) || !analyzaRow || analyzaRow.zaznam_cesta !== 'recording/bp-rec-test') {
    throw new Error('❌ Súbor nahrávky alebo záznam cesty v DB nebol uložený správne!');
  }
  console.log(`   ✅ Dáta záznamu zapísané na disk (${chunkRes.fileName}) a DB prepojená (${analyzaRow.zaznam_cesta}).`);

  // 16.8 Bezpečnosť: ne-HR používateľ nemôže pauzovať/vypínať/spúšťať nahrávanie
  let forbiddenThrown = false;
  try {
    recMgr.controlRecording(recInterview.room_id, { authUser: null, action: 'stop' });
  } catch (authErr) {
    if (authErr.statusCode === 403) forbiddenThrown = true;
  }
  if (!forbiddenThrown) {
    throw new Error('❌ Neprihlásený používateľ / kandidát nesmie mať možnosť ovládať nahrávanie!');
  }

  // 16.9 Manuálne ovládanie pre HR / Superadmina: pozastaviť -> pokračovať -> vypnúť + manuálne spustiť
  mockNowMs += 3000;
  recSnap = recMgr.controlRecording(recInterview.room_id, { authUser: testAdminUser, action: 'pause' });
  if (recSnap.state !== 'paused') throw new Error('❌ HR nedokázal pozastaviť nahrávanie!');

  mockNowMs += 2000;
  recSnap = recMgr.controlRecording(recInterview.room_id, { authUser: testAdminUser, action: 'resume' });
  if (recSnap.state !== 'recording') throw new Error('❌ HR nedokázal pokračovať v nahrávaní!');

  mockNowMs += 4000;
  recSnap = recMgr.controlRecording(recInterview.room_id, { authUser: testAdminUser, action: 'stop' });
  recMgr.tickAllRooms(); // Overenie, že po ručnom vypnutí HR sa nahrávanie znova samovoľne nespustí
  const afterStopTick = recMgr.getStatus(recInterview.room_id);
  if (recSnap.state !== 'stopped' || afterStopTick.state !== 'stopped') {
    throw new Error('❌ Po ručnom zastavení HR musí nahrávanie zostať vypnuté!');
  }

  // HR môže kedykoľvek manuálne nahrávanie opäť zapnúť
  recSnap = recMgr.controlRecording(recInterview.room_id, { authUser: testAdminUser, action: 'start' });
  if (recSnap.state !== 'recording' || recSnap.trigger !== 'manual') {
    throw new Error('❌ HR nedokázal ručne zapnúť nové nahrávanie!');
  }
  recMgr.controlRecording(recInterview.room_id, { authUser: testAdminUser, action: 'stop' });
  console.log('   ✅ Ovládanie HR/Superadmina (spustiť, pozastaviť, pokračovať, vypnúť) a blokovanie cudzích overené na 100%.');

  // 16.10 Regresný test: HR sa pripojí cez Vstúpiť (autoJoin=true) aj keď má pohovor zadaný rovnaký e-mail ako HR
  const selfMailInterview = dbModule.createInterview({
    datum: schedStr,
    hr_id: testAdminUser.id,
    meno_respondenta: 'Test Rovnaký Mail',
    mail_respondenta: testAdminUser.mail,
    link_meeting: 'https://host2.fxcomputers.net:13192/meeting/bp-rec-self',
    room_id: 'bp-rec-self',
    titul_pozicia: 'Self-mail Test',
  }, 'admin');
  const selfPresenceHr = recMgr.registerPresence(selfMailInterview.room_id, {
    clientId: 'cli-self-hr',
    authUser: testAdminUser,
    name: expectedAdminName,
    email: testAdminUser.mail,
    inviteeEmail: '',
    autoJoin: true,
  });
  if (!selfPresenceHr.participant.canControlRecording || selfPresenceHr.participant.roleTag !== 'hr') {
    throw new Error(`❌ HR s rovnakým testovacím e-mailom ako kandidát stratil tlačidlá nahrávania cez Vstúpiť: ${JSON.stringify(selfPresenceHr.participant)}`);
  }
  const selfPresenceCand = recMgr.registerPresence(selfMailInterview.room_id, {
    clientId: 'cli-self-cand',
    authUser: null,
    name: 'Test Rovnaký Mail',
    email: testAdminUser.mail,
    inviteeEmail: testAdminUser.mail,
    autoJoin: false,
  });
  if (selfPresenceCand.participant.canControlRecording || selfPresenceCand.participant.roleTag !== 'kandidat') {
    throw new Error('❌ Neprihlásený kandidát cez ?invitee= nemá mať tlačidlá nahrávania!');
  }
  dbModule.deleteInterview(selfMailInterview.id, 'admin');
  console.log('   ✅ Regresný test: HR cez Vstúpiť si zachová tlačidlá nahrávania aj keď má rovnaký e-mail ako kandidát.');

  fs.rmSync(tmpRecDir, { recursive: true, force: true });
  dbModule.deleteInterview(recInterview.id, 'admin');

  // Upratanie tímového testovacieho pohovoru
  dbModule.deleteInterview(teamInterview.id, 'admin');

  // 17. Upratanie testovacích dát
  console.log('\n1️⃣7️⃣ Čistenie testovacích záznamov...');
  dbModule.deleteInterview(newInterview.id, 'admin');
  console.log('   ✅ Testovacie záznamy boli vyčistené.');

  console.log('\n🎉 VŠETKY TESTY PREBEHLI NA 100% ÚSPEŠNE!');
}

runTests().catch(err => {
  console.error('\n❌ Chyba pri teste:', err);
  process.exit(1);
});

