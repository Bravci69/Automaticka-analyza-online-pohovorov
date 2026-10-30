import re
from collections import Counter
from pathlib import Path

import easygui
import matplotlib.pyplot as plt
import numpy as np

# Regulárne výrazy pre vyhľadanie údajov v súbore
RE_REC = {
    "vyplnove": re.compile(r"Celkový počet výplňových slov:\s*(\d+)", re.IGNORECASE),
    "vsetky": re.compile(r"Celkový počet všetkých slov:\s*(\d+)", re.IGNORECASE),
    "vyhladavane": re.compile(r"Celkový počet vyhľadávaných slov:\s*(\d+)", re.IGNORECASE),
}
RE_TVARE = re.compile(r"^\s*(.+?)\s*:\s*(\d+)\s*\(")

def nacitaj_kombinovane_hodnotenie(subor_nazov):
    """Načíta štatistiky reči a tváre z kombinovaného TXT súboru."""
    pocty_slov = {}
    pocty_emocii = Counter()

    with open(subor_nazov, "r", encoding="utf-8") as subor:
        for riadok in subor:
            # Kontrola pre reč
            for nazov, vzor in RE_REC.items():
                zhoda = vzor.search(riadok)
                if zhoda:
                    pocty_slov[nazov] = int(zhoda.group(1))

            # Kontrola pre tvár
            zhoda_tvare = RE_TVARE.match(riadok)
            if zhoda_tvare:
                emocia, pocet = zhoda_tvare.groups()
                pocty_emocii[emocia.strip()] += int(pocet)

    return pocty_slov, pocty_emocii

def vsetky_grafy(subor_nazov=None):
    """Vykreslí spoločný okenný graf pozostávajúci z 2 pychartov na základe kombinovaného súboru."""
    try:
        if subor_nazov is None:
            priecinok_hodnotenia = (
                Path(__file__).resolve().parent.parent
                / "hodnotenia"
                / "kombinovane_hodnotenia"
            )
            subor_nazov = easygui.fileopenbox(
                title="Vyberte kombinované hodnotenie",
                filetypes=["kombinacia_hodnoteni_*.txt", "*.txt"],
                default=str(priecinok_hodnotenia / "*.txt"),
            )

        if not subor_nazov:
            print("[INFO] Nebol vybraný žiadny súbor.")
            return 1

        pocty_slov, pocty_emocii = nacitaj_kombinovane_hodnotenie(subor_nazov)
        
        # Validácia
        povinne_hodnoty = {"vyplnove", "vsetky", "vyhladavane"}
        if not povinne_hodnoty.issubset(pocty_slov):
            print("[ERROR] Súbor neobsahuje kompletné hodnotenie slov.")
            return 1
        if not pocty_emocii:
            print("[ERROR] Súbor neobsahuje rozpoznateľné hodnotenie emócií.")
            return 1

        # Dáta pre graf reči
        vsetky_slova = pocty_slov["vsetky"]
        vyhladavane = min(pocty_slov["vyhladavane"], vsetky_slova)
        vyplnove = min(pocty_slov["vyplnove"], vsetky_slova - vyhladavane)
        nevyplnove = vsetky_slova - vyhladavane - vyplnove
        
        nazvy_reci = ["Vyhľadávané slová", "Výplňové slová", "Zvyšné slová"]
        hodnoty_reci = [vyhladavane, vyplnove, nevyplnove]
        farby_reci = plt.get_cmap("Set2", len(nazvy_reci))(np.arange(len(nazvy_reci)))

        # Dáta pre graf tváre
        emocie = list(pocty_emocii.keys())
        hodnoty_emocii = list(pocty_emocii.values())
        pocet_emocii = len(emocie)
        mapa_farieb = plt.get_cmap("tab20", pocet_emocii)
        farby_emocii = mapa_farieb(np.arange(pocet_emocii))

        # Vytvorenie grafu - 1 riadok, 2 stĺpce
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 7))
        nazov_okna = Path(subor_nazov).name
        if hasattr(fig.canvas.manager, "set_window_title"):
            fig.canvas.manager.set_window_title(nazov_okna)
            
        fig.suptitle(f"Kombinované hodnotenie: {nazov_okna}", fontsize=14, fontweight='bold')

        # === 1. Graf Reči ===
        def popis_percenta_reci(percento):
            pocet = round(percento / 100 * vsetky_slova)
            return f"{percento:.1f}%\n({pocet})"

        wedges_reci, _, autotexts_reci = ax1.pie(
            hodnoty_reci,
            labels=nazvy_reci,
            autopct=popis_percenta_reci,
            colors=farby_reci,
            startangle=90,
            wedgeprops={"linewidth": 1, "edgecolor": "white"},
            textprops={"color": "black"},
        )
        
        ax1.legend(
            wedges_reci,
            [f"{nazov}: {pocet}" for nazov, pocet in zip(nazvy_reci, hodnoty_reci)],
            title="Slová",
            loc="lower center",
            bbox_to_anchor=(0.5, -0.15),
        )
        ax1.set_title("Hodnotenie reči")
        ax1.axis("equal")
        plt.setp(autotexts_reci, size=9, weight="bold")

        # === 2. Graf Tváre ===
        def popis_percenta_tvare(percento):
            pocet = round(percento / 100 * sum(hodnoty_emocii))
            return f"{percento:.1f}%\n({pocet})"

        wedges_tvare, _, autotexts_tvare = ax2.pie(
            hodnoty_emocii,
            labels=emocie,
            autopct=popis_percenta_tvare,
            colors=farby_emocii,
            startangle=90,
            wedgeprops={"linewidth": 1, "edgecolor": "white"},
            textprops={"color": "black"},
        )
        
        ax2.legend(
            wedges_tvare,
            [f"{emocia}: {pocet}" for emocia, pocet in zip(emocie, hodnoty_emocii)],
            title="Emócie",
            loc="lower center",
            bbox_to_anchor=(0.5, -0.2),
            ncol=2
        )
        ax2.set_title("Hodnotenie emócií tváre")
        ax2.axis("equal")
        plt.setp(autotexts_tvare, size=9, weight="bold")

        plt.tight_layout(rect=[0, 0.05, 1, 0.95])
        plt.show()
        return 0
    except (OSError, ValueError) as exc:
        print(f"\n[ERROR] Vytvorenie grafu zlyhalo s chybou: {exc}")
        return -1

if __name__ == "__main__":
    vsetky_grafy()