import moviepy.editor as mp
import easygui
import os
import sys
from datetime import datetime


def extrahovanie_audio(video_subor=None, vrat_subor=False):
    """Extrahuje audio z videosúboru."""

    if video_subor is None:
        video_subor = easygui.fileopenbox(
            title="Vyberte videonahrávku",
            filetypes=["*.mp4", "*.avi", "*.mov"]
        )

    if not video_subor:
        print("[INFO] Žiadne video nebolo vybrané")
        return 1

    print(f"[INFO] Video: {video_subor}")
    print("\n[KROK 1] Extrakcia audio z videa...")
    
    try:
        vid = mp.VideoFileClip(video_subor)
        
        if not vid.audio:
            print("[ERROR] Videá nemá audio stopu")
            vid.close()
            return 1
        
        # Informácie o audio
        trvanie = vid.audio.duration
        print(f"  Trvanie: {formát_čas(trvanie)}")
        
        # Uloženie audio
        cas = datetime.now().strftime("%Y%m%d_%H%M%S")
        audio_subor = f"audio_{cas}.wav"
        
        print(f"  Ukladám do: {audio_subor}...")
        vid.audio.write_audiofile(audio_subor, verbose=False, logger=None)
        vid.close()
        
        print(f"\n[OK] Audio extrahované!")
        print(f"     Súbor: {audio_subor}")
        print(f"     Veľkosť: {os.path.getsize(audio_subor) / (1024*1024):.2f} MB")
        return audio_subor if vrat_subor else 0
        
    except Exception as e:
        print(f"[ERROR] {e}")
        return 1


def formát_čas(sekundy):
    """Konverzia sekúnd na formát HH:MM:SS."""
    h = int(sekundy // 3600)
    m = int((sekundy % 3600) // 60)
    s = int(sekundy % 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


if __name__ == "__main__":
    exit_code = extrahovanie_audio()
    sys.exit(exit_code)
