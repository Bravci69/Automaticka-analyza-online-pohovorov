import sys

import easygui

try:
    from .extrakcia_audio import extrahovanie_audio
    from .rozpoznavanie_reci import rozpoznavanie_reci
    from .hodnotenie_textu import hodnotenie_textu
    from .graf_hodnotenia_reci import graf_hodnotenia_reci
except ImportError:
    from extrakcia_audio import extrahovanie_audio
    from rozpoznavanie_reci import rozpoznavanie_reci
    from hodnotenie_textu import hodnotenie_textu
    from graf_hodnotenia_reci import graf_hodnotenia_reci


def spusti_priamo(video_subor=None, progress_callback=None, show_graph=True):
    """Spustí extrakciu a rozpoznávanie naraz."""

    progress_callback = progress_callback or (lambda message, percent: None)

    print("=" * 80)
    print("ROZPOZNÁVANIE REČI - KOMPLETNÝ PROCES")
    print("=" * 80)
    
    if video_subor is None:
        video_subor = easygui.fileopenbox(
            title="Vyberte video na ohodnotenie",
            filetypes=["*.mp4", "*.avi", "*.mov"]
        )
    if not video_subor:
        print("[INFO] Žiadne video nebolo vybrané")
        return

    print("\n[FÁZA 1] Extrakcia audia z videa...")
    progress_callback("Rozpoznávanie reči: extrakcia audia", 0)
    audio_subor = extrahovanie_audio(video_subor, vrat_subor=True)

    if not isinstance(audio_subor, str):
        print("\n[ERROR] Extrakcia zlyhala")
        return
    
    print("\n[FÁZA 2] Rozpoznávanie reči z audia...")
    progress_callback("Rozpoznávanie reči: prepis audia", 25)
    text_subor = rozpoznavanie_reci(
        audio_subor,
        vrat_subor=True,
        progress_callback=lambda message, percent: progress_callback(
            message, 25 + percent * 0.4
        ),
    )

    if not isinstance(text_subor, str):
        print("\n[ERROR] Rozpoznávanie zlyhalo")
        return

    print("\n[FÁZA 3] Hodnotenie textu a zhoda slov...")
    progress_callback("Rozpoznávanie reči: hodnotenie textu", 65)
    result3 = hodnotenie_textu(text_subor, vrat_subor=True)

    if not isinstance(result3, str):
        print(f"\n[ERROR] Hodnotenie zlyhalo s kódom: {result3}")
        return

    if show_graph:
        print("\n[FÁZA 4] Vytvorenie grafu hodnotenia...")
        progress_callback("Rozpoznávanie reči: vytváranie grafu", 90)
        result4 = graf_hodnotenia_reci(result3)

        if result4 != 0:
            print(f"\n[ERROR] Vytvorenie grafu zlyhalo s kódom: {result4}")
            return

    progress_callback("Rozpoznávanie reči: dokončené", 100)
    print("\n[OK] Proces dokončený!")
    return result3


if __name__ == "__main__":
    video_argument = sys.argv[1] if len(sys.argv) > 1 else None
    sys.exit(spusti_priamo(video_argument))
