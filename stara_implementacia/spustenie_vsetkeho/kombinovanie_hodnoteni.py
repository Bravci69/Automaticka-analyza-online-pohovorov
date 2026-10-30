import datetime
from pathlib import Path

def kombinuj_hodnotenia(subor_reci: str, subor_tvare: str) -> str:
    """Spojí textové výsledky z rozpoznávania reči a tváre do jedného súboru."""
    if not subor_reci or not subor_tvare:
        print("[INFO] Chýbajú niektoré hodnotenia pre kombináciu.")
        return None
        
    cesta_reci = Path(subor_reci)
    cesta_tvare = Path(subor_tvare)
    
    if not cesta_reci.exists() or not cesta_tvare.exists():
        print("[ERROR] Niektorý zo súborov hodnotení neexistuje.")
        return None

    cas_zaznamu = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    nazov_suboru = f"kombinacia_hodnoteni_{cas_zaznamu}.txt"
    
    priecinok = Path(__file__).resolve().parent.parent / "hodnotenia" / "kombinovane_hodnotenia"
    priecinok.mkdir(parents=True, exist_ok=True)
    
    cesta_vysledku = priecinok / nazov_suboru
    
    obsah_reci = cesta_reci.read_text(encoding="utf-8")
    obsah_tvare = cesta_tvare.read_text(encoding="utf-8")
    
    vysledny_text = (
        "============================================================\n"
        "                    KOMBINOVANÉ HODNOTENIE\n"
        "============================================================\n"
        f"Dátum a čas: {datetime.datetime.now().strftime('%d.%m.%Y %H:%M:%S')}\n"
        "============================================================\n\n"
        "[1] HODNOTENIE REČI\n"
        "------------------------------------------------------------\n"
        f"{obsah_reci}\n\n"
        "[2] HODNOTENIE EMÓCIÍ TVÁRE\n"
        "------------------------------------------------------------\n"
        f"{obsah_tvare}\n"
        "============================================================\n"
    )
    
    cesta_vysledku.write_text(vysledny_text, encoding="utf-8")
    print(f"\n[OK] Kombinované hodnotenie uložené do: {cesta_vysledku}")
    
    return str(cesta_vysledku)