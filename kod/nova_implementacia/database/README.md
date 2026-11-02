# Databáza pohovorov a HR administrácie

Bakalárska práca - FIIT STU v Bratislave  
Autor: Jakub Chmura

Tento priečinok obsahuje kompletnú SQLite databázovú vrstvu pre automatickú analýzu online pohovorov a HR portál.

---

## 📁 Štruktúra súborov

- `schema.sql` - Čitateľná SQL schéma s definíciami tabuliek, cudzích kľúčov, indexov a popisov.
- `pohovory.db` - Súbor SQLite databázy (s podporou WAL módu a foreign keys).
- `db.js` - Hlavný Node.js databázový modul (`node:sqlite`) obsahujúci bezpečnú autentifikáciu, CRUD operácie, prepojenia a SSE EventEmitter pre real-time notifikácie.
- `init_db.js` - Samostatne spustiteľný CLI skript pre inicializáciu, kontrolu a reset databázy.
- `test_db_and_api.js` - Komplexné integračné testy overujúce všetky požiadavky zadania.

---

## 🗄️ Databázová schéma

### 1. `users`
Uchováva používateľov systému (HR a Superadminov).
- `id` (INTEGER, PRIMARY KEY AUTOINCREMENT)
- `username` (TEXT, UNIQUE, NOT NULL)
- `meno` (TEXT, NOT NULL)
- `priezvisko` (TEXT, NOT NULL)
- `mail` (TEXT, UNIQUE, NOT NULL)
- `password_hash` (TEXT, NOT NULL) - heslo zahashované algoritmom scrypt
- `password_salt` (TEXT, NOT NULL) - 16-bajtová unikátna kryptografická soľ
- `ures_tag` (TEXT, NOT NULL) - rola: `SUPERADMIN`, `HR_ADMIN`
- `created_at` (TEXT, NOT NULL) - čas vytvorenia

### 2. `hr_admin`
Prepojenie na používateľa, štatistika pohovorov a najbližší termín.
- `id` (INTEGER, PRIMARY KEY AUTOINCREMENT)
- `user_id` (INTEGER, UNIQUE, NOT NULL, FOREIGN KEY na `users.id`)
- `pocet_interviews` (INTEGER, NOT NULL DEFAULT 0)
- `datum_interview` (TEXT) - dátum najbližšieho/naplánovaného pohovoru
- `updated_at` (TEXT) - čas poslednej zmeny

### 3. `vyhodnotenie` (Enum tabuľka)
Číselník povolených stavov vyhodnotenia pohovoru:
1. `rozpracovane` - Rozpracované
2. `neprebehlo` - Neprebehlo
3. `postupil` - Postúpil
4. `nepostupil` - Nepostúpil

### 4. `interview`
Záznamy o dohodnutých pohovoroch s kandidátmi.
- `id` (INTEGER, PRIMARY KEY AUTOINCREMENT)
- `datum` (TEXT, NOT NULL) - dátum a čas pohovoru
- `hr_id` (INTEGER, NOT NULL, FOREIGN KEY na `users.id`)
- `meno_hr` (TEXT, NOT NULL) - meno a priezvisko priradeného HR
- `meno_respondenta` (TEXT, NOT NULL)
- `mail_respondenta` (TEXT, NOT NULL)
- `link_meeting` (TEXT, NOT NULL) - webový odkaz na meeting
- `room_id` (TEXT, UNIQUE, NOT NULL) - identifikátor Jitsi miestnosti
- `titul_pozicia` (TEXT, NOT NULL) - názov pracovnej pozície
- `vyhodnotenie` (TEXT, NOT NULL, FOREIGN KEY na `vyhodnotenie.kod`)
- `poznamky` (TEXT)
- `created_at` (TEXT, NOT NULL)

### 5. `audit_logs`
Sledovanie všetkých operácií v systéme v reálnom čase (vytvorenie používateľa, registrácia pohovoru, zmena vyhodnotenia, prihlásenie).

### 6. `interview_analyza`
Ukladá multimodálne výsledky analýzy z Jitsi stretnutia (skóre pozornosti, dominantná emócia, počet výplňových slov).

### 7. `sessions`
Ukladá trvalé prihlasovacie relácie s platnosťou 30 dní (`token`, `user_id`, `created_at`, `expires_at`). Zabezpečuje, že používateľ zostane prihlásený 30 dní aj po reštarte servera.

---

## 🔑 Predvolený administrátor

Pri inicializácii je automaticky vytvorený 1. používateľ:
- **Používateľské meno:** `admin`
- **Heslo:** `admin` (v databáze bezpečne zahashované scryptom)
- **Rola (`ures_tag`):** `SUPERADMIN`
- **Email:** `admin@fiit.stuba.sk`

---

## 🚀 Spustenie a testovanie

```powershell
# Kontrola a výpis stavu databázy cez CLI:
node kod/nova_implementacia/database/init_db.js

# Spustenie integračných testov:
node kod/nova_implementacia/database/test_db_and_api.js

# Spustenie webového servera:
node kod/nova_implementacia/server/server.js
```

Po spustení servera je HR konzola dostupná na adrese:  
👉 **http://localhost:45681/admin**

