import re
from pathlib import Path

import easygui
import matplotlib.pyplot as plt
import numpy as np


VYSLEDOK = {
    "vyplnove": re.compile(r"Celkový počet výplňových slov:\s*(\d+)", re.IGNORECASE),
    "vsetky": re.compile(r"Celkový počet všetkých slov:\s*(\d+)", re.IGNORECASE),
    "vyhladavane": re.compile(r"Celkový počet vyhľadávaných slov:\s*(\d+)", re.IGNORECASE),
}


def nacitaj_hodnotenie(subor_nazov):
    """Načíta počty slov z výsledného TXT súboru."""
    pocty_slov = {}

    with open(subor_nazov, "r", encoding="utf-8") as subor:
        for riadok in subor:
            for nazov, vzor in VYSLEDOK.items():
                zhoda = vzor.search(riadok)
                if zhoda:
                    pocty_slov[nazov] = int(zhoda.group(1))

    return pocty_slov


def graf_hodnotenia_reci(subor_nazov=None):
    try:
        if subor_nazov is None:
            priecinok_hodnotenia = (
                Path(__file__).resolve().parent.parent
                / "hodnotenia"
                / "hodnotenie_reci"
            )
            subor_nazov = easygui.fileopenbox(
                title="Vyberte hodnotenie slov",
                filetypes=["hodnotenie_*.txt", "*.txt"],
                default=str(priecinok_hodnotenia / "*.txt"),
            )

        if not subor_nazov:
            print("[INFO] Nebol vybraný žiadny súbor.")
            return 1

        pocty_slov = nacitaj_hodnotenie(subor_nazov)
        povinne_hodnoty = {"vyplnove", "vsetky", "vyhladavane"}
        if not povinne_hodnoty.issubset(pocty_slov):
            print("[ERROR] Súbor neobsahuje kompletné hodnotenie slov.")
            return 1

        vsetky_slova = pocty_slov["vsetky"]
        vyhladavane = min(pocty_slov["vyhladavane"], vsetky_slova)
        vyplnove = min(pocty_slov["vyplnove"], vsetky_slova - vyhladavane)
        nevyplnove = vsetky_slova - vyhladavane - vyplnove
        nazvy = ["Vyhľadávané slová", "Výplňové slová", "Zvyšné slová"]
        hodnoty = [vyhladavane, vyplnove, nevyplnove]
        farby = plt.get_cmap("Set2", len(nazvy))(np.arange(len(nazvy)))

        def popis_percenta(percento):
            pocet = round(percento / 100 * vsetky_slova)
            return f"{percento:.1f}%\n({pocet})"

        fig, ax = plt.subplots(figsize=(10, 7))
        nazov_okna = Path(subor_nazov).name
        if hasattr(fig.canvas.manager, "set_window_title"):
            fig.canvas.manager.set_window_title(nazov_okna)
        wedges, _, autotexts = ax.pie(
            hodnoty,
            labels=nazvy,
            autopct=popis_percenta,
            colors=farby,
            startangle=90,
            wedgeprops={"linewidth": 1, "edgecolor": "white"},
            textprops={"color": "black"},
        )

        ax.legend(
            wedges,
            [f"{nazov}: {pocet}" for nazov, pocet in zip(nazvy, hodnoty)],
            title="Slová",
            loc="center left",
            bbox_to_anchor=(1, 0, 0.4, 1),
        )
        ax.set_title(f"Hodnotenie slov: {Path(subor_nazov).name}")
        ax.axis("equal")
        plt.setp(autotexts, size=9, weight="bold")
        plt.tight_layout()
        plt.show()
        return 0
    except (OSError, ValueError) as exc:
        print(f"\n[ERROR] Vytvorenie grafu zlyhalo s chybou: {exc}")
        return -1


if __name__ == "__main__":
    graf_hodnotenia_reci()
    