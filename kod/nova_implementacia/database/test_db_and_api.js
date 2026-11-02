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

  // 7. Vytvorenie pohovoru pre kandidáta
  console.log('\n7️⃣ Vytvorenie pohovoru (interview)...');
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

  // 10. Kontrola live snapshotu databázy
  console.log('\n🔟 Získanie kompletného Live Snapshotu databázy...');
  const snapshot = dbModule.getLiveDatabaseSnapshot();
  console.log(`   ✅ Používatelia v DB: ${snapshot.stats.totalUsers}`);
  console.log(`   ✅ HR Admini v DB: ${snapshot.stats.totalHrAdmins}`);
  console.log(`   ✅ Pohovory v DB: ${snapshot.stats.totalInterviews}`);
  console.log(`   ✅ Postúpili: ${snapshot.stats.postupili}`);
  console.log(`   ✅ Audit logy: ${snapshot.tables.audit_logs.length}`);

  // 11. Upratanie testovacích dát
  console.log('\n1️⃣1️⃣ Čistenie testovacích záznamov...');
  dbModule.deleteInterview(newInterview.id, 'admin');
  dbModule.deleteUser(hrUser.id, 'admin');
  dbModule.deleteUser(superAdminUser.id, 'admin');
  console.log('   ✅ Testovacie záznamy boli vyčistené.');

  console.log('\n🎉 VŠETKY TESTY PREBEHLI NA 100% ÚSPEŠNE!');
}

runTests().catch(err => {
  console.error('\n❌ Chyba pri teste:', err);
  process.exit(1);
});

