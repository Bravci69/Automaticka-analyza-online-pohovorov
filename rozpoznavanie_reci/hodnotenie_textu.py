import re
import sys
from datetime import datetime
from pathlib import Path
import easygui

def prepis_vyplnove_slova_subor():
    """Načíta výplňové slová zo súboru 'vyplnove-slova.voxlens' a vráti ich ako zoznam."""
    subor = Path(__file__).resolve().parent / "vyplnove-slova.voxlens"
    try:
        with subor.open("r", encoding="utf-8") as subor_text:
            slova = []
            for riadok in subor_text:
                riadok = riadok.strip().lower()
                if not riadok:
                    continue
                slova.append(re.sub(r"(?<!\\) ", r"\\ ", riadok))
            return slova
    except OSError as exc:
        raise SystemExit(f"Nepodarilo sa načítať súbor '{subor}'.") from exc



def pocet_vyplnovych_slov(text):
    slova = sorted(prepis_vyplnove_slova_subor(), key=len, reverse=True)
    pattern = r"(?<!\w)(?:" + "|".join(slova) + r")(?!\w)"
    return len(re.findall(pattern, text, re.IGNORECASE))


def prepis_vyhladavanych_slov_subor():
    """Načíta slová zo súboru vyhladavane-slova.voxlens."""
    subor = Path(__file__).resolve().parent / "vyhladavane-slova.voxlens"
    try:
        with subor.open("r", encoding="utf-8") as subor_text:
            slova = []
            for riadok in subor_text:
                riadok = riadok.strip().lower()
                if riadok:
                    slova.append(re.escape(riadok))
            return slova
    except OSError as exc:
        raise SystemExit(f"Nepodarilo sa načítať súbor '{subor}'.") from exc


def pocet_vyhladavanych_slov(text):
    slova = sorted(prepis_vyhladavanych_slov_subor(), key=len, reverse=True)
    if not slova:
        return 0
    pattern = r"(?<!\w)(?:" + "|".join(slova) + r")(?!\w)"
    return len(re.findall(pattern, text, re.IGNORECASE))

def hodnotenie_textu(subor_nazov=None, vrat_subor=False):
    if subor_nazov is None:
        subor_nazov = easygui.fileopenbox(
            title="Vyberte textový súbor",
            filetypes=["*.txt"]
        )

    if not subor_nazov:
            print("[INFO] Žiadny textový súbor nebolo vybraný")
            return 1

    slova = {}

    print(f"[INFO] Text: {subor_nazov}")
    print("\n[KROK 4] Hodnotenie výsledkov...")

    with open(subor_nazov, 'r', encoding='utf-8') as f:
        text = f.read().lower()

    zoznam_slov = re.findall(
        r"\b[\wáäčďéěíĺľňóôŕšťúýž]+\b",
        text
    )

    vsetky_slova=0
    for slovo in zoznam_slov:
        slova[slovo]=slova.get(slovo,0)+1
        vsetky_slova+=1

    for slovo, pocet in slova.items():
        print(f"{slovo}: {pocet}")

    pocet_slov = pocet_vyplnovych_slov(text)
    pocet_vyhladavanych = pocet_vyhladavanych_slov(text)

    print(f"Celkový počet výplňových slov: {pocet_slov}")
    print(f"Celkový počet všetkých slov: {vsetky_slova}")
    print(f"Celkovy počet vyplňových slov: {pocet_slov}")
    print(f"Celkový počet zvyšných slov: {vsetky_slova - pocet_slov - pocet_vyhladavanych}")
    percento_vyplnovych_slov = (pocet_slov/vsetky_slova)*100 if vsetky_slova>0 else 0
    percento_vyhladavanych_slov = (pocet_vyhladavanych/vsetky_slova)*100 if vsetky_slova>0 else 0
    print(f"Percento výplňových slov: {percento_vyplnovych_slov:.2f}%")
    print(f"Celkový počet vyhľadávaných slov: {pocet_vyhladavanych}")
    print(f"Percento vyhľadávaných slov: {percento_vyhladavanych_slov:.2f}%")

    # Uloženie
    print("\n[KROK 5] Uloženie výsledkov...")
    try:
        cas = datetime.now().strftime("%Y%m%d_%H%M%S")
        vystupny_subor = Path(__file__).resolve().parent / f"hodnotenie_{cas}.txt"

        output_text = "\n".join([
            "HODNOTENIE VÝSLEDKOV",
            "="*80,
            f"Celkový počet výplňových slov: {pocet_slov}",
            f"Celkový počet všetkých slov: {vsetky_slova}",
            f"Percento výplňových slov: {percento_vyplnovych_slov:.2f}%",
            f"Celkový počet vyhľadávaných slov: {pocet_vyhladavanych}",
            f"Percento vyhľadávaných slov: {percento_vyhladavanych_slov:.2f}%",
            "="*80,
            *[f"{slovo}: {pocet}" for slovo,pocet in slova.items()],
            "",
            "="*80,
        ])

        with open(vystupny_subor, 'w', encoding='utf-8') as f:
            f.write(output_text)
            f.write("\n")

        print(f"[OK] Uložené do: {vystupny_subor}")
        print(output_text)
        return str(vystupny_subor) if vrat_subor else 0

    except Exception as e:
        print(f"[ERROR] {e}")
        return 1

if __name__ == "__main__":
    exit_code = hodnotenie_textu()
    sys.exit(exit_code)