import sys

import easygui

if __package__:
    from .graf_hodnotenia_tvare import graf_hodnotenia_tvare
    from .hodnotenie_emocie import hodnotenie_emocii
    from .zistenie_emocii import zistenie_emocii
else:
    from graf_hodnotenia_tvare import graf_hodnotenia_tvare
    from hodnotenie_emocie import hodnotenie_emocii
    from zistenie_emocii import zistenie_emocii


def spusti_priamo(video_subor=None, progress_callback=None, show_graph=True):
    """Spustí zistenie, hodnotenie a graf emócií v jednom procese."""
    progress_callback = progress_callback or (lambda message, percent: None)
    print("=" * 80)
    print("ROZPOZNÁVANIE EMÓCIÍ - KOMPLETNÝ PROCES")
    print("=" * 80)

    if video_subor is None:
        video_subor = easygui.fileopenbox(
            title="Vyberte video na rozpoznanie emócií",
            filetypes=["*.mp4", "*.avi", "*.mov"],
        )
    if not video_subor:
        print("[INFO] Žiadne video nebolo vybrané.")
        return

    print("\n[FÁZA 1] Rozpoznávanie emócií z videa...")
    progress_callback("Rozpoznávanie tváre: analýza videa", 0)
    emocie_subor = zistenie_emocii(
        video_subor,
        vrat_subor=True,
        progress_callback=lambda message, percent: progress_callback(
            message, percent * 0.8
        ),
    )
    if not isinstance(emocie_subor, str):
        print(f"\n[ERROR] Zistenie emócií zlyhalo s kódom: {emocie_subor}")
        return

    print("\n[FÁZA 2] Hodnotenie emócií...")
    progress_callback("Rozpoznávanie tváre: hodnotenie emócií", 80)
    hodnotenie_subor = hodnotenie_emocii(emocie_subor, vrat_subor=True)
    if not isinstance(hodnotenie_subor, str):
        print(f"\n[ERROR] Hodnotenie emócií zlyhalo s kódom: {hodnotenie_subor}")
        return

    if show_graph:
        print("\n[FÁZA 3] Vytvorenie grafu emócií...")
        progress_callback("Rozpoznávanie tváre: vytváranie grafu", 90)
        vysledok_grafu = graf_hodnotenia_tvare(hodnotenie_subor)
        if vysledok_grafu != 0:
            print(f"\n[ERROR] Vytvorenie grafu zlyhalo s kódom: {vysledok_grafu}")
            return

    progress_callback("Rozpoznávanie tváre: dokončené", 100)
    print("\n[OK] Proces emócií dokončený!")
    return hodnotenie_subor


if __name__ == "__main__":
    video_argument = sys.argv[1] if len(sys.argv) > 1 else None
    vysledok = spusti_priamo(video_argument)
    sys.exit(0 if isinstance(vysledok, str) else 1)
