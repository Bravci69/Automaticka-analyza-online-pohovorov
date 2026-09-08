import os
import sys
import tkinter as tk
from tkinter import messagebox, ttk
import logging
import easygui


os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
logging.getLogger("tensorflow").setLevel(logging.ERROR)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rozpoznavanie_reci import spusti_vsetko as spusti_rec
from rozpoznavanie_reci.graf_hodnotenia_reci import graf_hodnotenia_reci
from progress import ProgressRunner

def spusti_rozpoznavanie_reci() -> None:
	video_subor = easygui.fileopenbox(
		title="Vyberte video na ohodnotenie",
		filetypes=["*.mp4", "*.avi", "*.mov"],
	)
	if not video_subor:
		return
	progress_runner.run(
		lambda report: spusti_rec.spusti_priamo(
			video_subor,
			progress_callback=report,
			show_graph=False,
		),
		"Rozpoznávanie reči",
		on_complete=lambda result, _error: graf_hodnotenia_reci(result),
	)

def spusti_rozpoznavanie_tvare() -> None:
	try:
		from rozpoznanie_tvare import spusti_vsetko as spusti_tvar
		from rozpoznanie_tvare.graf_hodnotenia_tvare import graf_hodnotenia_tvare
		video_subor = easygui.fileopenbox(
			title="Vyberte videonahrávku na rozpoznanie emócií",
			filetypes=["*.mp4", "*.avi", "*.mov"],
		)
		if not video_subor:
			return
		progress_runner.run(
			lambda report: spusti_tvar.spusti_priamo(
				video_subor,
				progress_callback=report,
				show_graph=False,
			),
			"Rozpoznávanie tváre",
			on_complete=lambda result, _error: graf_hodnotenia_tvare(result),
		)
	except ModuleNotFoundError as chyba:
		if chyba.name != "deepface":
			raise
		messagebox.showerror(
			"Chýba DeepFace",
			"DeepFace nie je nainštalovaný v tomto Pythone.\n"
			"Spustite aplikáciu Pythonom 3.12 alebo nainštalujte DeepFace.",
		)

root = tk.Tk()
root.title("Moje grafické rozhranie")
root.geometry("800x600")


def ukonci_aplikaciu() -> None:
	try:
		import matplotlib.pyplot as plt
		plt.close("all")
	except ImportError:
		pass
	root.destroy()


root.protocol("WM_DELETE_WINDOW", ukonci_aplikaciu)

menu=tk.Menu(root)
root.config(menu=menu)

tlacitkoRozpoznanieReci = tk.Button(root,text="Spustiť proces rozpoznávania reči",command=spusti_rozpoznavanie_reci,)
tlacitkoRozpoznanieReci.pack()
tlacitkoRozpoznanieTvare = tk.Button(root,text="Spustiť proces rozpoznávania tvár",command=spusti_rozpoznavanie_tvare,)
tlacitkoRozpoznanieTvare.pack()

progress_runner = ProgressRunner(
	root,
	controls=[tlacitkoRozpoznanieReci, tlacitkoRozpoznanieTvare],
)


filemenu=tk.Menu(menu)
menu.add_cascade(label="Súbor",menu=filemenu)
filemenu.add_command(label="Ukončiť",command=root.quit)
filemenu.add_command(label="O programe",command=lambda: messagebox.showinfo("O programe","Toto je jednoduché grafické rozhranie pre rozpoznávanie reči a tvár."))

helpmenu=tk.Menu(menu)
menu.add_cascade(label="Pomoc",menu=helpmenu)
helpmenu.add_command(label="O programe",command=lambda: messagebox.showinfo("O programe","Toto je jednoduché grafické rozhranie pre rozpoznávanie reči a tvár."))

ratingmenu=tk.Menu(menu)
menu.add_cascade(label="Hodnotenie",menu=ratingmenu)
ratingmenu.add_command(label="rozpoznanie reči",command=spusti_rozpoznavanie_reci)
ratingmenu.add_command(label="rozpoznanie tvár",command=spusti_rozpoznavanie_tvare)

root.mainloop()