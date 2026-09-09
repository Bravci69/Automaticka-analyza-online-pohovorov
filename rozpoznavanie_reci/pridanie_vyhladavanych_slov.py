from pathlib import Path
from tkinter import messagebox
import tkinter as tk
from tkinter import simpledialog

class MultilineTextDialog(simpledialog.Dialog):
    def __init__(self, parent, title, msg):
        self.msg = msg
        self.result_text = None
        super().__init__(parent, title)

    def body(self, master):
        tk.Label(master, text=self.msg).pack(padx=10, pady=5)
        self.text_widget = tk.Text(master, width=40, height=10)
        self.text_widget.pack(padx=10, pady=5)
        return self.text_widget

    def apply(self):
        self.result_text = self.text_widget.get("1.0", tk.END).strip()

def ziskaj_text_tk(title, msg):
    root = tk._default_root
    if not root:
        root = tk.Tk()
        root.withdraw()
    d = MultilineTextDialog(root, title, msg)
    return d.result_text

SUBOR = Path(__file__).parent / "vyhladavane-slova.voxlens"

def vymazanie_rovnakych_riadkov(text: str) -> str:
    """Odstráni duplicitné riadky zo zadaného textu."""
    riadky = text.splitlines()
    unikatne_riadky = list(dict.fromkeys(riadky))
    return "\n".join(unikatne_riadky)

def main() -> None:
	text = ziskaj_text_tk(
		title="Pridanie vyhľadávaných slov",
		msg="Zadajte nové slová, každé na samostatný riadok:",
	)
	if text is None:
		messagebox.showinfo("Zrušené", "Pridávanie bolo zrušené.")
		return

	slova = [riadok.strip() for riadok in text.splitlines() if riadok.strip()]

	if not slova:
		messagebox.showwarning("Prázdne", "Neboli zadané žiadne slová.")
		return

	existujuce = SUBOR.read_text(encoding="utf-8") if SUBOR.exists() else ""
	spojene_slova = "\n".join(filter(None, [existujuce.strip(), "\n".join(slova)]))
	novy_obsah = vymazanie_rovnakych_riadkov(spojene_slova)
	SUBOR.write_text(novy_obsah, encoding="utf-8")

	messagebox.showinfo("Hotovo", f"Úspešne pridaných slov: {len(slova)}")


if __name__ == "__main__":
	main()
