import subprocess
import sys
import os


def spusti_priamo():
    """Spustí extrakciu a rozpoznávanie naraz."""
    
    # Zisti aktuálny adresár
    aktualny_adresar = os.path.dirname(os.path.abspath(__file__))
    
    print("=" * 80)
    print("ROZPOZNÁVANIE REČI - KOMPLETNÝ PROCES")
    print("=" * 80)
    
    print("\n[FÁZA 1] Extrakcia audio z videa...")
    skript1 = os.path.join(aktualny_adresar, "extrakcia_audio.py")
    print(f"[DEBUG] Spúšťam: {skript1}")
    
    result1 = subprocess.run([sys.executable, skript1], capture_output=False)
    
    if result1.returncode != 0:
        print(f"\n[ERROR] Extrakcia zlyhala s kódom: {result1.returncode}")
        input("Stlačte ENTER pre ukončenie...")
        return
    
    input("\n[INFO] Stlačte ENTER pre pokračovanie na rozpoznávanie reči...")
    
    print("\n[FÁZA 2] Rozpoznávanie reči z audio...")
    skript2 = os.path.join(aktualny_adresar, "rozpoznavanie_reci.py")
    print(f"[DEBUG] Spúšťam: {skript2}")
    
    result2 = subprocess.run([sys.executable, skript2], capture_output=False)
    
    if result2.returncode != 0:
        print(f"\n[ERROR] Rozpoznávanie zlyhalo s kódom: {result2.returncode}")
        input("Stlačte ENTER pre ukončenie...")
        return
    
    print("\n[OK] Proces dokončený!")


if __name__ == "__main__":
    spusti_priamo()
