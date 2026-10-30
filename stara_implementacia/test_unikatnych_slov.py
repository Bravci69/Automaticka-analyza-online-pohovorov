import re
import easygui

subor_nazov=easygui.fileopenbox(
    title="Vyberte textový súbor", 
    filetypes=["*.txt"]
)
slova = {}

with open(subor_nazov, 'r', encoding='utf-8') as f:
    text = f.read().lower()

zoznam_slov = re.findall(
    r"\b[\wáäčďéěíĺľňóôŕšťúýž]+\b",
    text
)

for slovo in zoznam_slov:
    slova[slovo] = slova.get(slovo, 0) + 1

for slovo, pocet in slova.items():
    print(f"{slovo}: {pocet}")

