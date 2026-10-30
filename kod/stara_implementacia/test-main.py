import subprocess
import sys
from pathlib import Path

import easygui


KOREN = Path(__file__).resolve().parent


def spusti_paralelne():
    """Spustí spracovanie reči a emócií z rovnakého videa paralelne."""
    video_subor = easygui.fileopenbox(
        title="Vyberte video na paralelné spracovanie",
        filetypes=["*.mp4", "*.avi", "*.mov"],
    )
    if not video_subor:
        print("[INFO] Žiadne video nebolo vybrané.")
        return 1

    skripty = [
        KOREN / "rozpoznanie_tvare" / "spusti_vsetko.py",
        KOREN / "rozpoznavanie_reci" / "spusti_vsetko.py",
    ]
    procesy = [
        subprocess.Popen(
            [sys.executable, str(skript), video_subor],
            cwd=str(skript.parent),
        )
        for skript in skripty
    ]

    navratove_kody = [proces.wait() for proces in procesy]
    if any(navratovy_kod != 0 for navratovy_kod in navratove_kody):
        print(f"[ERROR] Paralelné spracovanie zlyhalo: {navratove_kody}")
        return 1

    print("\n[OK] Paralelné spracovanie dokončené!")
    return 0


if __name__ == "__main__":
    sys.exit(spusti_paralelne())
