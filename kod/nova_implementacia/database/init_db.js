// =============================================================================
// CLI inicializátor a kontrolór databázy
// Bakalárska práca - FIIT STU Bratislava
// =============================================================================

const { initDatabase, getLiveDatabaseSnapshot } = require('./db');

console.log('🚀 Inicializujem databázu...');
initDatabase();

const snapshot = getLiveDatabaseSnapshot();
console.log('\n📊 Súhrn databázy:');
console.log('-------------------------------------------');
console.log(`📁 Umiestnenie DB: ${snapshot.stats.dbPath}`);
console.log(`💾 Veľkosť súboru: ${snapshot.stats.dbSize}`);
console.log(`👥 Počet používateľov: ${snapshot.stats.totalUsers}`);
console.log(`👔 Počet HR adminov: ${snapshot.stats.totalHrAdmins}`);
console.log(`🎙️ Počet pohovorov: ${snapshot.stats.totalInterviews}`);
console.log('-------------------------------------------');
console.log('\n👤 Používatelia v DB:');
for (const u of snapshot.tables.users) {
  console.log(`- [ID: ${u.id}] ${u.username} (${u.meno} ${u.priezvisko}) | Rola: ${u.ures_tag} | Email: ${u.mail}`);
  console.log(`  Zahashované heslo: ${u.password_hash.substring(0, 24)}... (Salt: ${u.password_salt})`);
}

console.log('\n🏷️ Číselník vyhodnotenia (Enum):');
for (const v of snapshot.tables.vyhodnotenie) {
  console.log(`- [${v.kod}] ${v.nazov} (${v.popis})`);
}

console.log('\n✅ Všetky tabuľky a počiatočný admin (admin/admin) sú pripravené!\n');

