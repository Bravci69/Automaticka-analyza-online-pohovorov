import sys

import easygui

from graf_hodnotenia_tvare import graf_hodnotenia_tvare
from hodnotenie_emocie import hodnotenie_emocii
from zistenie_emocii import zistenie_emocii


def spusti_priamo():
    """Spustí zistenie, hodnotenie a graf emócií v jednom procese."""
    print("=" * 80)
    print("ROZPOZNÁVANIE EMÓCIÍ - KOMPLETNÝ PROCES")
    print("=" * 80)

    video_subor = easygui.fileopenbox(
        title="Vyberte video na rozpoznanie emócií",
        filetypes=["*.mp4", "*.avi", "*.mov"],
    )
    if not video_subor:
        print("[INFO] Žiadne video nebolo vybrané.")
        return

    print("\n[FÁZA 1] Rozpoznávanie emócií z videa...")
    emocie_subor = zistenie_emocii(video_subor, vrat_subor=True)
    if not isinstance(emocie_subor, str):
        print(f"\n[ERROR] Zistenie emócií zlyhalo s kódom: {emocie_subor}")
        return

    print("\n[FÁZA 2] Hodnotenie emócií...")
    hodnotenie_subor = hodnotenie_emocii(emocie_subor, vrat_subor=True)
    if not isinstance(hodnotenie_subor, str):
        print(f"\n[ERROR] Hodnotenie emócií zlyhalo s kódom: {hodnotenie_subor}")
        return

    print("\n[FÁZA 3] Vytvorenie grafu emócií...")
    vysledok_grafu = graf_hodnotenia_tvare(hodnotenie_subor)
    if vysledok_grafu != 0:
        print(f"\n[ERROR] Vytvorenie grafu zlyhalo s kódom: {vysledok_grafu}")
        return

    print("\n[OK] Proces emócií dokončený!")


if __name__ == "__main__":
    sys.exit(spusti_priamo())
