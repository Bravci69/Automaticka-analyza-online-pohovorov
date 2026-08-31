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
│   └── spusti_vsetko.py
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

### 5.3 Spustenie celého procesu
Súbor: `rozpoznavanie_reci/spusti_vsetko.py`

Tento skript spustí celý pipeline v poradí:

1. extrakcia audio z videa,
2. rozpoznanie reči z audio,
3. ukladanie výsledku do textového súboru.

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
