# 🚀 Návod na lokálne spustenie aplikácie
**Bakalárska práca: Automatická analýza online pohovorov**

Tento priečinok obsahuje všetky potrebné automatizované spúšťače pre jednoduché spustenie celej platformy na vašom lokálnom počítači (Windows).

---

## ⚡ Rýchly štart na 1 kliknutie

Pre okamžité spustenie celej aplikácie stačí spustiť súbor:
👉 **`SPUSTIT_VSETKO_LOKALNE.bat`**

Tento skript automaticky:
1. Skontroluje systémové požiadavky (Node.js, npm).
2. V prípade potreby automaticky nainštaluje závislosti.
3. Spustí lokálny zabezpečený HTTPS server s SQLite databázou.
4. Automaticky vám otvorí webový prehliadač s **HR administrátorskou konzolou**.
5. Ponúkne vám možnosť okamžite spustiť aj desktopového Electron klienta (emulátor pracovného prostredia pohovoru).

---

## 📋 Zoznam dostupných spúšťačov

| Súbor | Popis |
| :--- | :--- |
| **`SPUSTIT_VSETKO_LOKALNE.bat`** | **Hlavný spúšťač** – spustí server, otvorí prehliadač a zobrazí interaktívne menu. |
| **`1_INSTALACIA_ZAVISLOSTI.bat`** | Nainštaluje všetky knižnice pre server aj Electron klienta (`npm install`) a skompiluje TypeScript kód. |
| **`2_SPUSTIT_SERVER.bat`** | Samostatne spustí lokálny Node.js HTTPS server (`https://localhost:13191`) s perzistentnou SQLite databázou. |
| **`3_SPUSTIT_KLIENTA.bat`** | Samostatne spustí klientsku desktopovú aplikáciu (Electron emulátor). |
| **`4_SPUSTIT_TESTY.bat`** | Spustí automatizovaný testovací balík (16 overovacích testov databázy, autentifikácie, e-mailov a API). |
| **`5_SPUSTIT_AI_MODULY_PYTHON.bat`** | Interaktívne menu pre spustenie offline Python AI analýz (analýza reči, tváre, kombinované metriky a grafy). |

---

## 💻 Systémové požiadavky

1. **Node.js**:
   - Odporúčaná verzia: **v22.x** alebo novšia (obsahuje natívnu podporu SQLite).
   - Stiahnuť môžete z: [https://nodejs.org/](https://nodejs.org/)
2. **Webový prehliadač**:
   - Google Chrome, Microsoft Edge, Mozilla Firefox alebo iný moderný prehliadač.
3. **Python (voliteľne)**:
   - Python 3.10+ (potrebný len v prípade, že chcete spúšťať staršie Python AI analytické moduly cez `5_SPUSTIT_AI_MODULY_PYTHON.bat`).

---

## 🔑 Prihlasovacie údaje do HR konzoly

Po spustení servera a otvorení `https://localhost:13191/admin.html` sa môžete prihlásiť týmito pripravenými účtami:

### 1. Hlavný Superadmin:
- **Používateľské meno (login):** `autworld`
- **Heslo:** `Captain99@`
- **Meno:** Jakub Chmura
- **Oprávnenia:** Kompletná správa systému, používateľov, e-mailov, obnovy DB a všetkých pohovorov.

### 2. Predvolený Administrátor:
- **Používateľské meno (login):** `admin`
- **Heslo:** `admin`
- **Meno:** Admin Systému
- **Oprávnenia:** Superadmin rola.

### 3. Vytvorenie vlastného účtu:
- Priamo v rozhraní HR konzoly pod záložkou **Používatelia & HR Admini** môže Superadmin vytvárať ďalších HR personalistov alebo Superadminov.

---

## 🔒 Upozornenie k SSL certifikátu na `localhost`

Server beží na zabezpečenom protokole **HTTPS** s lokálnym certifikátom (kvôli bezpečnému WebRTC prenosu videa, zvuku a kamery v prehliadači).

Pri prvom otvorení adresy `https://localhost:13191/admin.html` váš webový prehliadač zobrazí štandardné bezpečnostné upozornenie na lokálny certifikát:
1. Kliknite na **„Rozšírené“** (alebo *Advanced*).
2. Kliknite na **„Pokračovať na localhost (nebezpečné)“** (alebo *Proceed to localhost*).
3. Stránka sa bezpečne načíta a prehliadač si povolenie zapamätá.

---

## 🌐 Hlavné lokálne URL adresy

- **HR Administrátorská konzola & Live DB prehliadač:**
  `https://localhost:13191/admin.html`
- **Vstupná stránka pohovoru:**
  `https://localhost:13191/`
- **Meeting miestnosť pohovoru:**
  `https://localhost:13191/meeting/<id_miestnosti>` (napr. `https://localhost:13191/meeting/bp-demo`)

---

## ✉️ E-mailové notifikácie a pripomienky

Aplikácia má prednastavené automatické odosielanie e-mailov cez Google SMTP:
- **Odosielateľ:** `oncall.noreply@gmail.com`
- **Pozvánky:** Odosielajú sa okamžite po vytvorení pohovoru uchádzačovi a prípadným pozvaným kolegom/teamleaderom s priloženým `.ics` kalendárom.
- **Pripomienky:** Automatický cron bežiaci na pozadí servera kontroluje a odosiela pripomienky 1 deň pred termínom pohovoru.
- Konfiguráciu SMTP môžete kedykoľvek otestovať alebo zmeniť v HR konzole kliknutím na tlačidlo **E-mail SMTP**.

---

## ❓ Časté otázky a riešenie problémov (FAQ)

### Port 13191 je už obsadený
Ak na porte 13191 beží iná aplikácia, môžete port zmeniť v súbore `kod/nova_implementacia/server/config.json` v položke `"port": 13191`, alebo spustiť server s premennou prostredia:
```cmd
set PORT=8443
node --experimental-sqlite server.js
```

### Chyba „Cannot find module 'nodemailer'“
Spustite skript `1_INSTALACIA_ZAVISLOSTI.bat`, ktorý automaticky stiahne a nainštaluje všetky chýbajúce balíčky.
