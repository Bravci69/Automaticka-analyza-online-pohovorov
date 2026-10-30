import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import easygui

KOREN = Path(__file__).resolve().parent.parent


def spusti_paralelne(video_subor=None, progress_callback=None, show_graph=True):
    """Spustí spracovanie reči a emócií z rovnakého videa paralelne vo vláknach."""
    progress_callback = progress_callback or (lambda message, percent: None)

    if not video_subor:
        video_subor = easygui.fileopenbox(
            title="Vyberte video na paralelné spracovanie",
            filetypes=["*.mp4", "*.avi", "*.mov"],
        )
    if not video_subor:
        print("[INFO] Žiadne video nebolo vybrané.")
        return None

    try:
        from rozpoznanie_tvare import spusti_vsetko as spusti_tvar
    except ModuleNotFoundError as chyba:
        if chyba.name != "deepface":
            raise
        raise RuntimeError(
            "DeepFace nie je nainštalovaný v tomto Pythone.\n"
            "Spustite aplikáciu Pythonom 3.12 alebo nainštalujte DeepFace."
        )

    from rozpoznavanie_reci import spusti_vsetko as spusti_rec

    progress_reci = 0.0
    progress_tvare = 0.0

    def update_progress():
        celkove = (progress_reci + progress_tvare) / 2
        progress_callback(
            f"Spracovávanie: reč ({progress_reci:.0f}%), tvár ({progress_tvare:.0f}%)",
            celkove,
        )

    def report_reci(msg, pct):
        nonlocal progress_reci
        progress_reci = pct
        update_progress()

    def report_tvare(msg, pct):
        nonlocal progress_tvare
        progress_tvare = pct
        update_progress()

    with ThreadPoolExecutor(max_workers=2) as executor:
        future_reci = executor.submit(
            spusti_rec.spusti_priamo,
            video_subor,
            progress_callback=report_reci,
            show_graph=show_graph,
        )
        future_tvare = executor.submit(
            spusti_tvar.spusti_priamo,
            video_subor,
            progress_callback=report_tvare,
            show_graph=show_graph,
        )

        vysledok_reci = future_reci.result()
        vysledok_tvare = future_tvare.result()

    try:
        if __package__:
            from .kombinovanie_hodnoteni import kombinuj_hodnotenia
        else:
            from kombinovanie_hodnoteni import kombinuj_hodnotenia
        kombinovany_subor = kombinuj_hodnotenia(vysledok_reci, vysledok_tvare)
    except Exception as chyba:
        print(f"\n[ERROR] Chyba pri vytváraní kombinovaného hodnotenia: {chyba}")
        kombinovany_subor = None

    print("\n[OK] Paralelné spracovanie dokončené!")
    return kombinovany_subor


if __name__ == "__main__":
    vysledok = spusti_paralelne()
    sys.exit(0 if isinstance(vysledok, str) else 1)
