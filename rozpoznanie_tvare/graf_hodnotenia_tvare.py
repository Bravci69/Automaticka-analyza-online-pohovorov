import re
from collections import Counter
from pathlib import Path

import easygui
import matplotlib.pyplot as plt
import numpy as np


RIADOK_VYSLEDKU = re.compile(r"^\s*(.+?)\s*:\s*(\d+)\s*\(")


def nacitaj_hodnotenie(subor_nazov):
    """Načíta názvy emócií a ich počty z výsledného TXT súboru."""
    pocty_emocii = Counter()

    with open(subor_nazov, "r", encoding="utf-8") as subor:
        for riadok in subor:
            zhoda = RIADOK_VYSLEDKU.match(riadok)
            if zhoda:
                emocia, pocet = zhoda.groups()
                pocty_emocii[emocia.strip()] += int(pocet)

    return pocty_emocii


def graf_hodnotenia_tvare(subor_nazov=None):
    try:
        if subor_nazov is None:
            priecinok_hodnotenia = (
                Path(__file__).resolve().parent.parent
                / "hodnotenia"
                / "hodnotenie_tvare"
            )
            subor_nazov = easygui.fileopenbox(
                title="Vyberte hodnotenie emócií",
                filetypes=["hodnotenie_emocii_*.txt", "*.txt"],
                default=str(priecinok_hodnotenia / "*.txt"),
            )

        if not subor_nazov:
            print("[INFO] Nebol vybraný žiadny súbor.")
            return 1

        pocty_emocii = nacitaj_hodnotenie(subor_nazov)
        if not pocty_emocii:
            print("[ERROR] Súbor neobsahuje rozpoznateľné hodnotenie emócií.")
            return 1

        emocie = list(pocty_emocii.keys())
        hodnoty = list(pocty_emocii.values())
        pocet_emocii = len(emocie)
        mapa_farieb = plt.get_cmap("tab20", pocet_emocii)
        farby = mapa_farieb(np.arange(pocet_emocii))

        def popis_percenta(percento):
            pocet = round(percento / 100 * sum(hodnoty))
            return f"{percento:.1f}%\n({pocet})"

        fig, ax = plt.subplots(figsize=(10, 7))
        nazov_okna = Path(subor_nazov).name
        if hasattr(fig.canvas.manager, "set_window_title"):
            fig.canvas.manager.set_window_title(nazov_okna)
        wedges, _, autotexts = ax.pie(
            hodnoty,
            labels=emocie,
            autopct=popis_percenta,
            colors=farby,
            startangle=90,
            wedgeprops={"linewidth": 1, "edgecolor": "white"},
            textprops={"color": "black"},
        )

        ax.legend(
            wedges,
            [f"{emocia}: {pocet}" for emocia, pocet in zip(emocie, hodnoty)],
            title="Emócie",
            loc="center left",
            bbox_to_anchor=(1, 0, 0.4, 1),
        )
        ax.set_title(f"Hodnotenie emócií: {Path(subor_nazov).name}")
        ax.axis("equal")
        plt.setp(autotexts, size=9, weight="bold")
        plt.tight_layout()
        plt.show(block=False)
        return 0
    except (OSError, ValueError) as exc:
        print(f"\n[ERROR] Vytvorenie grafu zlyhalo s chybou: {exc}")
        return -1


if __name__ == "__main__":
    graf_hodnotenia_tvare()
    