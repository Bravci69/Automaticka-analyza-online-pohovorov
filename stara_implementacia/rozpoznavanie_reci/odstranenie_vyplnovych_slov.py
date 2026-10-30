from pathlib import Path
from tkinter import messagebox
import tkinter as tk
from tkinter import simpledialog

class MultiChoiceDialog(simpledialog.Dialog):
    def __init__(self, parent, title, msg, choices):
        self.msg = msg
        self.choices = choices
        self.result_choices = None
        super().__init__(parent, title)

    def body(self, master):
        tk.Label(master, text=self.msg).pack(padx=10, pady=5)
        frame = tk.Frame(master)
        frame.pack(padx=10, pady=5, fill=tk.BOTH, expand=True)
        scrollbar = tk.Scrollbar(frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.listbox = tk.Listbox(frame, selectmode=tk.MULTIPLE, width=40, height=15, yscrollcommand=scrollbar.set)
        self.listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.listbox.yview)
        for choice in self.choices:
            self.listbox.insert(tk.END, choice)
        return self.listbox

    def apply(self):
        selected_indices = self.listbox.curselection()
        if selected_indices:
            self.result_choices = [self.listbox.get(i) for i in selected_indices]
        else:
            self.result_choices = []

def ziskaj_vyber_tk(title, msg, choices):
    root = tk._default_root
    if not root:
        root = tk.Tk()
        root.withdraw()
    d = MultiChoiceDialog(root, title, msg, choices)
    return d.result_choices

SUBOR = Path(__file__).resolve().parent / "vyplnove-slova.voxlens"

def nacitaj_slova() -> list[str]:
    if not SUBOR.exists():
        raise SystemExit(f"Súbor '{SUBOR}' neexistuje.")

    return [riadok.strip() for riadok in SUBOR.read_text(encoding="utf-8").splitlines() if riadok.strip()]


def main() -> None:
    slova = nacitaj_slova()
    if not slova:
        messagebox.showwarning("Prázdne", "Súbor neobsahuje žiadne slová.")
        return

    vybrane_slova = ziskaj_vyber_tk(
        title="Odstránenie výplňových slov",
        msg="Vyberte slová, ktoré chcete odstrániť:",
        choices=slova,
    )
    
    if not vybrane_slova:
        messagebox.showinfo("Zrušené", "Neboli vybrané žiadne slová.")
        return

    vybrane = set(vybrane_slova)
    zostavajuce_slova = [slovo for slovo in slova if slovo not in vybrane]
    SUBOR.write_text("\n".join(zostavajuce_slova), encoding="utf-8")
    messagebox.showinfo("Hotovo", f"Úspešne odstránených slov: {len(vybrane_slova)}")


if __name__ == "__main__":
    main()
