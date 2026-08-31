import os
import re
import sys
from datetime import datetime
import easygui

def vyplnove_slovo(slovo):
    patern = r"""
        (?: ee*m|uh*m|ehm|hmm|hm|eee|aaa|mmm|akoby|ináč|oné|teda|tak|vlastne|
            jednoducho|proste|akože|práve|nejako|trochu|myslím|možno|asi|skrátka|
            samozrejme|povedzme|takpovediac|v\ zásade|v\ podstate|že\ jo|že\ áno|
            ja\ neviem|podľa\ mňa|myslím\ si|na\ jednej\ strane|na\ druhej\ strane
        )"""
    return bool(re.match(patern,slovo,re.IGNORECASE|re.VERBOSE))

def hodnotenie_textu():
    subor_nazov=easygui.fileopenbox(
        title="Vyberte textový súbor", 
        filetypes=["*.txt"]
    )

    if not subor_nazov:
            print("[INFO] Žiadny textový súbor nebolo vybraný")
            return 1

    slova = {}

    print(f"[INFO] Text: {subor_nazov}")
    print("\n[KROK 4] Hodnotenie výsledkov...")

    with open(subor_nazov, 'r', encoding='utf-8') as f:
        text = f.read().lower()

    zoznam_slov = re.findall(
        r"\b[\wáäčďéěíĺľňóôŕšťúýž]+\b",
        text
    )

    vsetky_slova=0
    for slovo in zoznam_slov:
        slova[slovo]=slova.get(slovo,0)+1
        vsetky_slova+=1

    for slovo, pocet in slova.items():
        print(f"{slovo}: {pocet}")

    pocet_slov = 0
    with open(subor_nazov,'r',encoding='utf-8') as f:
        for line in f:
            cisty_riadok = re.sub(r'[^\w\s]','',line)
            slova_v_riadku = cisty_riadok.split()
            for slovo in slova_v_riadku:
                if vyplnove_slovo(slovo):
                    pocet_slov+=1

    print(f"Celkový počet výplňových slov: {pocet_slov}")
    print(f"Celkový počet všetkých slov: {vsetky_slova}")
    percento_vyplnovych_slov = (pocet_slov/vsetky_slova)*100 if vsetky_slova>0 else 0
    print(f"Percento výplňových slov: {percento_vyplnovych_slov:.2f}%")

    # Uloženie
    print("\n[KROK 5] Uloženie výsledkov...")
    try:
        cas = datetime.now().strftime("%Y%m%d_%H%M%S")
        vystupny_subor = f"hodnotenie_{cas}.txt"

        output_text = "\n".join([
            "HODNOTENIE VÝSLEDKOV",
            "="*80,
            f"Celkový počet výplňových slov: {pocet_slov}",
            f"Celkový počet všetkých slov: {vsetky_slova}",
            f"Percento výplňových slov: {percento_vyplnovych_slov:.2f}%",
            "="*80,
            *[f"{slovo}: {pocet}" for slovo,pocet in slova.items()],
            "",
            "="*80,
        ])

        with open(vystupny_subor,'w',encoding='utf-8') as f:
            f.write(output_text)
            f.write("\n")

        print(f"[OK] Uložené do: {vystupny_subor}")
        print(output_text)
        return 0

    except Exception as e:
        print(f"[ERROR] {e}")
        return 1

if __name__ == "__main__":
    exit_code = hodnotenie_textu()
    sys.exit(exit_code)