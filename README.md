# Automatická analýza online pohovorov

Bakalársky projekt zameraný na automatickú analýzu online pohovorov s cieľom zjednodušiť a zobjektivniť hodnotenie správania respondentov počas rozhovoru. Projekt kombinuje spracovanie zvuku a reči, následné rozpoznávanie textu a potenciálne rozšírenie o analýzu neverbálnych signálov a sémantiky prejavu.

## 1. Téma projektu

Téma práce: Automatická analýza online pohovorov.

Hlavný cieľ je vytvoriť nástroj, ktorý dokáže z nahrávky pohovoru vyhodnotiť aspekty ako:

- reč a tempo prejavu,
- množstvo a frekvencia použitých slov,
- výskyt vyplňovacích slov,
- hlasitosť a intonáciu,
- neverbálne signály, napr. mimika, pohyby hlavy, očný kontakt,
- sémantika odpovedí a celkový charakter prejavu.

Cieľom nie je posudzovať správnosť odpovedí, ale kvalitu a charakter prejavu z objektívneho a neutrálného pohľadu.

## 2. Motivácia a kontext

V online pohovoroch je často náročné odhadnúť, ako respondent komunikuje, aký má prejav a ako sa vyjadruje. Analýza pohovorov môže pomôcť:

- zefektívniť hodnotenie kandidátov,
- zvýšiť objektivitu procesu,
- odhaliť vzorce v správaní a komunikácii,
- podporiť rozhodovanie pri výbere talántov,
- znížiť závislosť na subjektívnom posudzovaní.

Práca sa zameriava na to, aby sa z rečového a vizuálneho prejavu dal vytvoriť spoľahlivý, prehľadný a opakovateľný model hodnotenia.

## 3. Zameranie práce podľa zadania a osnovy

Projekt je navrhnutý tak, aby pokrýval nasledovné oblasti:

- rešerš aktuálnych prístupov k analýze reči a správania v online pohovoroch,
- návrh vlastného systému a metodiky hodnotenia,
- implementáciu prototypu na spracovanie audio a textu,
- overenie funkčnosti na testovacích nahrávkach,
- dokumentáciu a opis možností rozšírenia do budúcnosti.

### Hlavné aspekty hodnotenia prejavu

V rámci zadania sa uvažuje o hodnotení viacerých javov:

- angažovanosť,
- vzrušenie,
- očný kontakt,
- hlas,
- mimika,
- sémantika odpovede,
- výskyt vyplňovacích slov,
- jedinečné slová za sekundu,
- celkový objem textu.


## 4. Štruktúra projektu

```text
Automaticka-analyza-online-pohovorov/
├── README.md
├── ZP-clenenie-pokyny_2022.pdf
├── téma.pdf
├── Zdroje/
|   ├──BP-osnova.txt
|   ├──BP-zadanie.txt
|   └──zdroje.txt
├── rozpoznavanie_reci/
│   ├── extrakcia_audio.py
│   ├── rozpoznavanie_reci.py
│   ├── hodnotenie_textu.py
│   ├── spusti_vsetko.py
│   ├── pridanie_vyplnovych_slov.py
│   ├── odstranenie_vyplnovych_slov.py
│   └── vyplnove-slova.voxlens
```

## 5. Aktuálna implementácia

V súčasnej verzii projekt obsahuje prototyp pre spracovanie zvuku a rozpoznávanie reči z nahrávky.

### 5.1 Extrakcia audia z videa
Súbor: `rozpoznavanie_reci/extrakcia_audio.py`

Táto časť:

- otvorí video súbor,
- overí, či video obsahuje zvukovú stopu,
- extrahuje audio do formátu `.wav`,
- uloží výsledok do aktuálneho pracovného priečinka.

### 5.2 Rozpoznávanie reči
Súbor: `rozpoznavanie_reci/rozpoznavanie_reci.py`

Táto časť:

- načíta audio súbor,
- rozdelí ho na časti po 60 sekúnd,
- použije Google speech recognition s jazykovým nastavením `sk-SK`,
- extrahuje audio do formátu `.txt`.

### 5.3 Hodnorenie reči
Súbor: `rozpoznavanie_reci/hodnotenie_textu.py`

Táto časť:

- načítava textový súbor,
- zistí počet všetkých slov
- zistí počet unikátnych slov,
- zistí počet výplňových slov,
- vypočíta percento výplňových slov
- uloží dáta do formátu `.txt`.

### 5.4 Spustenie celého procesu
Súbor: `rozpoznavanie_reci/spusti_vsetko.py`

Tento skript spustí celý pipeline v poradí:

1. extrakcia audio z videa,
2. rozpoznanie reči z audio,
3. ukladanie výsledku do textového súboru,
4. hodnotenie textu z textového súboru,
5. uloženie hodnotenia do súboru.

## 6. Použitie

### Inštalácia závislostí

Vytvorte virtuálne prostredie a nainštalujte potrebné balíky:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install moviepy SpeechRecognition easygui
```

### Spustenie celého procesu

```bash
cd rozpoznavanie_reci
python spusti_vsetko.py
```

### Spustenie jednotlivých skriptov

```bash
python extrakcia_audio.py
python rozpoznavanie_reci.py
python hodnotenie_textu.py
```

## 7. Výstup

Po spracovaní vzniká textový súbor s rozpoznaným prejavom, obsahujúci:

- čas spustenia,
- názov audio súboru,
- jazyk rozpoznávania,
- výsledný text z nahrávky.

Tento výstup bude naďalej použitý na:

- analýzu slovnej zásoby,
- výpočet tempo reči,
- detekciu vyplňovacích slov,
- zhodnotenie sémantiky odpovedí,
- rozšírenie o neverbálne parametre.

## 8. Dôležité obmedzenia aktuálneho prototypu

V súčasnej verzii ide o funkčný MVP, ktorý má niekoľko limitácií:

- rozpoznávanie reči je založené na Google Speech Recognition a je teda závislé na online službe,
- kvalitný výsledok vyžaduje čistý zvuk, minimálny šum a rozumne znelé audio,
- pri potichom prejave, prekrývaní reči alebo častých vyplňových slov môže dôjsť k nepresnostiam,
- slovenský jazyk je náročný na kvalitné rozpoznanie, preto je potrebné ďalej vylepšovať model a prispôsobiť pipeline,
- nie je zatiaľ riešená plná analýza neverbálnych prejavov

## 9. Budúce rozšírenia

Práca bude rozšírená v nasledujúcich smeroch:

- integrácia hlasového modelu pre slovenský jazyk, napr. Whisper alebo podobných nástrojov,
- analýza neverbálnych javov z videa (úsmev, pohyby, očný kontakt, mimika),
- detekcia vyplňovacích slov a prerušenia prejavu,
- výpočet métrik typu slov za sekundu, jedinečné slová, tempo reči a emočný tón,
- vytvorenie databázy a porovnávacej evaluácie respondentov,
- návrh modelu hodnotenia založeného na váhovaných kritériách.

V súčasnej fáze je implementovaný prototyp pre extrakciu audio a rozpoznávanie reči

## 10. Podrobný popis skriptov v priečinku `kod/rozpoznavanie_reci`

Táto časť dopĺňa podrobný návod k jednotlivým Python skriptom, ktoré sa nachádzajú v priečinku `kod/rozpoznavanie_reci`.

### 10.1 `extrakcia_audio.py`

Skript slúži na extrakciu zvukovej stopy z video súboru.

Postup:

1. Otvorí okno na výber video súboru.
2. Podporuje súbory `.mp4`, `.avi` a `.mov`.
3. Pomocou knižnice MoviePy otvorí video.
4. Skontroluje, či video obsahuje zvukovú stopu.
5. Zistí trvanie zvuku.
6. Uloží zvuk ako súbor `.wav` s názvom obsahujúcim dátum a čas.

Skript používa `easygui` na výber videa a `moviepy` na prácu s videom. Výstupný WAV súbor sa uloží do aktuálneho pracovného priečinka, z ktorého bol skript spustený.

Spustenie z koreňového priečinka projektu:

```powershell
python .\kod\rozpoznavanie_reci\extrakcia_audio.py
```

Spustenie priamo z priečinka so skriptom:

```powershell
cd .\kod\rozpoznavanie_reci
python .\extrakcia_audio.py
```

### 10.2 `rozpoznavanie_reci.py`

Skript slúži na rozpoznanie reči zo zvukového súboru.

Postup:

1. Otvorí okno na výber audio súboru.
2. Podporuje súbory `.wav` a `.mp3` podľa možností knižnice SpeechRecognition.
3. Načíta zvuk pomocou `speech_recognition.AudioFile`.
4. Rozdelí zvuk na približne 60-sekundové časti.
5. Každú časť odošle do služby Google Speech Recognition s jazykom `sk-SK`.
6. Spojí rozpoznané časti do jedného textu.
7. Uloží výsledok do súboru `preklad_RRRRMMDD_HHMMSS.txt`.

Tento skript používa online službu Google Speech Recognition. Na rozpoznanie reči je preto potrebné internetové pripojenie.

Spustenie:

```powershell
python .\kod\rozpoznavanie_reci\rozpoznavanie_reci.py
```

### 10.3 `hodnotenie_textu.py`

Skript analyzuje textový súbor a vypočíta základné štatistiky slov.

Postup:

1. Otvorí okno na výber súboru `.txt`.
2. Načíta text a prevedie ho na malé písmená.
3. Nájde všetky slová pomocou regulárneho výrazu.
4. Spočíta celkový počet slov.
5. Spočíta výskyt každého slova.
6. Načíta zoznam výplňových slov zo súboru `vyplnove-slova.voxlens`.
7. Vyhľadá jednoslovné aj viacslovné výplňové výrazy.
8. Vypočíta počet a percentuálny podiel výplňových slov.
9. Uloží výsledok ako `hodnotenie_RRRRMMDD_HHMMSS.txt` do priečinka, kde sa nachádza skript.

Súbor `vyplnove-slova.voxlens` obsahuje jeden výraz na riadok. Riadky môžu obsahovať aj regulárne výrazy a viacslovné výrazy s escapovanou medzerou, napríklad:

```text
ehm
ee*m
myslím\ si
```

Spustenie:

```powershell
python .\kod\rozpoznavanie_reci\hodnotenie_textu.py
```

### 10.4 `pridanie_vyplnovych_slov.py`

Skript umožňuje používateľovi pridať nové výplňové slová alebo výrazy do súboru `vyplnove-slova.voxlens`.

Postup:

1. Otvorí viacriadkové okno `easygui.textbox`.
2. Používateľ zadá každé nové slovo alebo výraz na samostatný riadok.
3. Prázdne riadky sa ignorujú.
4. Existujúce a nové riadky sa spoja.
5. Funkcia `vymazanie_rovnakych_riadkov()` odstráni duplicity.
6. Súbor sa uloží bez prázdneho riadku na konci.

Spustenie:

```powershell
python .\kod\rozpoznavanie_reci\pridanie_vyplnovych_slov.py
```

### 10.5 `odstranenie_vyplnovych_slov.py`

Skript umožňuje odstrániť vybrané výplňové slová zo súboru `vyplnove-slova.voxlens`.

Postup:

1. Načíta existujúce neprázdne riadky zo súboru.
2. Otvorí okno `easygui.multchoicebox` so zoznamom výrazov.
3. Používateľ môže vybrať jeden alebo viac riadkov.
4. Vybrané riadky odstráni.
5. Ostatné výrazy zachová v pôvodnom poradí.
6. Súbor uloží bez prázdneho riadku na konci.

Spustenie:

```powershell
python .\kod\rozpoznavanie_reci\odstranenie_vyplnovych_slov.py
```

### 10.6 `spusti_vsetko.py`

Skript spúšťa starší trojfázový pipeline.

Postup:

1. Spustí `extrakcia_audio.py`.
2. Po úspešnej extrakcii počká na potvrdenie používateľa.
3. Spustí `rozpoznavanie_reci.py`.
4. Po úspešnom rozpoznaní počká na ďalšie potvrdenie.
5. Spustí `hodnotenie_textu.py`.
6. Vypíše informáciu o úspešnom dokončení.

Spustenie:

```powershell
python .\kod\rozpoznavanie_reci\spusti_vsetko.py
```

Tento pipeline používa `moviepy` a Google Speech Recognition, preto nie je úplne offline. Pri lokálnom spracovaní audia sa používa samostatný skript `kod/test-separatne-hlasy.py`, ktorý vytvára prepis pre každého rečníka.

## 11. Inštalácia závislostí pre priečinok `rozpoznavanie_reci`

Pre skripty v tomto priečinku sú potrebné tieto balíky:

```powershell
pip install easygui moviepy SpeechRecognition
```

Ak chce používateľ používať iba `hodnotenie_textu.py`, `pridanie_vyplnovych_slov.py` alebo `odstranenie_vyplnovych_slov.py`, stačí nainštalovať:

```powershell
pip install easygui
```

## 12. Spúšťanie z koreňového priečinka projektu

Všetky príkazy sa dajú spustiť aj z koreňového priečinka `BP`:

```powershell
python .\kod\rozpoznavanie_reci\extrakcia_audio.py
python .\kod\rozpoznavanie_reci\rozpoznavanie_reci.py
python .\kod\rozpoznavanie_reci\hodnotenie_textu.py
python .\kod\rozpoznavanie_reci\pridanie_vyplnovych_slov.py
python .\kod\rozpoznavanie_reci\odstranenie_vyplnovych_slov.py
python .\kod\rozpoznavanie_reci\spusti_vsetko.py
```

Pred spustením skontrolujte, že príkaz `python` používa správne virtuálne prostredie a že sú nainštalované potrebné závislosti.