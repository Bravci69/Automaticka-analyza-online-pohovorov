import re
import easygui

def vyplnove_slovo(slovo):
    patern=r'\b(ee*m|uh*m|akoby|^že jo$|^že áno$|ináč|oné)\b'
    return bool(re.match(patern, slovo, re.IGNORECASE))


pocet_slov = 0
vystup=easygui.fileopenbox(
    title="Vyberte textový súbor", 
    filetypes=["*.txt"]
)
with open(vystup,'r',encoding='utf-8') as f:
    for line in f:
        cisty_riadok = re.sub(r'[^\w\s]', '', line)
        slova=cisty_riadok.split()
        for slovo in slova:
            if vyplnove_slovo(slovo):
                pocet_slov+=1


print(f"Celkový počet výplňových slov: {pocet_slov}")

