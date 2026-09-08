import speech_recognition as sr
import easygui
import os
import sys
from datetime import datetime


def rozpoznavanie_reci(audio_subor=None, vrat_subor=False, progress_callback=None):
    """Rozpoznáva reč z audio súboru."""

    progress_callback = progress_callback or (lambda message, percent: None)

    if audio_subor is None:
        audio_subor = easygui.fileopenbox(
            title="Vyberte audio súbor",
            filetypes=["*.wav", "*.mp3"]
        )
    
    if not audio_subor:
        print("[INFO] Žiadny audio súbor nebolo vybraný")
        return 1
    
    print(f"[INFO] Audio: {audio_subor}")
    print("\n[KROK 2] Rozpoznávanie reči...")
    
    try:
        rozpoznavac = sr.Recognizer()
        vysledky = []
        
        # Načítanie audia
        print("  Načítavam audio...")
        with sr.AudioFile(audio_subor) as zdroj:
            audio = rozpoznavac.record(zdroj)
        
        print("  Rozdelenie na kusy (60s)...")
        audio_data = audio.get_wav_data()
        fps = audio.sample_rate
        bytes_kus = 60 * fps * 2
        celkovo_dat = len(audio_data)
        
        # Rozpoznávanie po kusoch
        pocet_kusov = 0
        for i in range(0, len(audio_data), bytes_kus):
            pocet_kusov += 1
            progress_callback(
                f"Rozpoznávanie reči: kus {pocet_kusov}",
                i / celkovo_dat * 100 if celkovo_dat else 100,
            )
            kusok = audio_data[i:i + bytes_kus]
            audio_kus = sr.AudioData(kusok, fps, 2)
            
            try:
                print(f"  Kus {pocet_kusov}...", end=" ")
                text = rozpoznavac.recognize_google(audio_kus, language="sk-SK")
                vysledky.append(text)
                print("[OK]")
            except sr.UnknownValueError:
                print("[NEČITATEĽNÝ]")
                vysledky.append("[NEČITATEĽNÝ]")
            except sr.RequestError as e:
                print(f"[ERROR: {str(e)[:20]}...]")
                vysledky.append(f"[ERROR]")

            progress_callback(
                f"Rozpoznávanie reči: kus {pocet_kusov} dokončený",
                min(100, (i + len(kusok)) / celkovo_dat * 100)
                if celkovo_dat else 100,
            )
        
        finalny_text = " ".join(vysledky)
        
        print(f"\n[OK] Rozpoznané {pocet_kusov} kusov!")
        
    except Exception as e:
        print(f"[ERROR] {e}")
        return 1
    
    # Uloženie
    print("\n[KROK 3] Uloženie výsledkov...")
    try:
        cas = datetime.now().strftime("%Y%m%d_%H%M%S")
        vystupny_subor = f"preklad_{cas}.txt"
        
        with open(vystupny_subor, 'w', encoding='utf-8') as f:
            f.write("ROZPOZNÁVANIE REČI Z AUDIA\n")
            f.write("=" * 80 + "\n\n")
            f.write(f"Čas: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Audio súbor: {os.path.basename(audio_subor)}\n")
            f.write(f"Jazyk: Slovenčina (sk-SK)\n")
            f.write("\n" + "=" * 80 + "\n")
            f.write("ROZPOZNANÝ TEXT:\n")
            f.write("=" * 80 + "\n\n")
            f.write(finalny_text)
            f.write("\n\n" + "=" * 80)
        
        print(f"[OK] Uložené do: {vystupny_subor}")
        print("\n" + "=" * 80)
        print("VÝSLEDOK:")
        print("=" * 80)
        
        # Ukážka textu
        if len(finalny_text) > 300:
            print(finalny_text[:300] + "...")
        else:
            print(finalny_text)
        
        print("=" * 80)
        return vystupny_subor if vrat_subor else 0
        
    except Exception as e:
        print(f"[ERROR] {e}")
        return 1


if __name__ == "__main__":
    exit_code = rozpoznavanie_reci()
    sys.exit(exit_code)
