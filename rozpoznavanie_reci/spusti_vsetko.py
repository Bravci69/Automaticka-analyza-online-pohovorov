import easygui

from extrakcia_audio import extrahovanie_audio
from rozpoznavanie_reci import rozpoznavanie_reci
from hodnotenie_textu import hodnotenie_textu


def spusti_priamo():
    """Spustí extrakciu a rozpoznávanie naraz."""

    print("=" * 80)
    print("ROZPOZNÁVANIE REČI - KOMPLETNÝ PROCES")
    print("=" * 80)
    
    video_subor = easygui.fileopenbox(
        title="Vyberte video na ohodnotenie",
        filetypes=["*.mp4", "*.avi", "*.mov"]
    )
    if not video_subor:
        print("[INFO] Žiadne video nebolo vybrané")
        return

    print("\n[FÁZA 1] Extrakcia audia z videa...")
    audio_subor = extrahovanie_audio(video_subor, vrat_subor=True)

    if not isinstance(audio_subor, str):
        print("\n[ERROR] Extrakcia zlyhala")
        return
    
    print("\n[FÁZA 2] Rozpoznávanie reči z audia...")
    text_subor = rozpoznavanie_reci(audio_subor, vrat_subor=True)

    if not isinstance(text_subor, str):
        print("\n[ERROR] Rozpoznávanie zlyhalo")
        return

    print("\n[FÁZA 3] Hodnotenie textu a zhoda slov...")
    result3 = hodnotenie_textu(text_subor)

    if result3 != 0:
        print(f"\n[ERROR] Hodnotenie zlyhalo s kódom: {result3}")
        return

    print("\n[OK] Proces dokončený!")


if __name__ == "__main__":
    spusti_priamo()
