import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

import easygui


PREKLAD_EMOCII = {
    "angry": "hnev",
    "disgust": "znechutenie",
    "fear": "strach",
    "happy": "šťastie",
    "neutral": "neutral",
    "sad": "smútok",
    "surprise": "prekvapenie",
}


def prelozenie_emocii(emocie):
    """Preloží názov emócie z angličtiny do slovenčiny."""
    emocia = emocie.strip().lower()
    return PREKLAD_EMOCII.get(emocia, emocia)


def ulozenie_unikatnych_emocii(emocie, priecinok):
    """Doplní nové slovenské emócie do súboru, každú iba raz."""
    zoznam_emocii = priecinok / "vsetky_emocie.voxlens"
    existujuce_emocie = set()

    if zoznam_emocii.exists():
        existujuce_emocie = {
            riadok.strip().lower()
            for riadok in zoznam_emocii.read_text(encoding="utf-8").splitlines()
            if riadok.strip()
        }

    nove_emocie = sorted(set(emocie) - existujuce_emocie)
    if nove_emocie:
        with zoznam_emocii.open("a", encoding="utf-8") as subor:
            for emocia in nove_emocie:
                subor.write(f"{emocia}\n")
        print(f"[OK] Nové emócie boli uložené do: {zoznam_emocii}")

def hodnotenie_emocii(subor_nazov=None):
    """Spočíta počet a percentuálne zastúpenie emócií v textovom súbore."""
    if subor_nazov is None:
        subor_nazov = easygui.fileopenbox(
            title="Vyberte súbor s emóciami",
            filetypes=["*.txt"],
        )

    if not subor_nazov:
        print("[INFO] Nebol vybraný žiadny súbor.")
        return 1

    try:
        with open(subor_nazov, "r", encoding="utf-8") as subor:
            emocie = [
                prelozenie_emocii(riadok)
                for riadok in subor
                if riadok.strip()
            ]
    except OSError as exc:
        print(f"[ERROR] Súbor sa nepodarilo načítať: {exc}")
        return 1

    if not emocie:
        print("[ERROR] Vybraný súbor neobsahuje žiadne emócie.")
        return 1

    ulozenie_unikatnych_emocii(emocie, Path(__file__).resolve().parent)
    pocty_emocii = Counter(emocie)
    celkovy_pocet = len(emocie)
    vysledky = []

    for emocia, pocet in sorted(pocty_emocii.items()):
        percento = pocet / celkovy_pocet * 100
        vysledky.append(f"{emocia}: {pocet} ({percento:.2f} %)")

    cas = datetime.now().strftime("%Y%m%d_%H%M%S")
    vystupny_subor = Path(subor_nazov).resolve().parent / f"hodnotenie_emocii_{cas}.txt"
    output_text = "\n".join(
        [
            "HODNOTENIE EMÓCIÍ",
            "=" * 40,
            f"Vstupný súbor: {Path(subor_nazov).name}",
            f"Celkový počet záznamov: {celkovy_pocet}",
            "",
            *vysledky,
            "=" * 40,
        ]
    )

    try:
        vystupny_subor.write_text(output_text + "\n", encoding="utf-8")
    except OSError as exc:
        print(f"[ERROR] Výsledky sa nepodarilo uložiť: {exc}")
        return 1

    print(output_text)
    print(f"[OK] Výsledky boli uložené do: {vystupny_subor}")
    return 0


if __name__ == "__main__":
    sys.exit(hodnotenie_emocii())
