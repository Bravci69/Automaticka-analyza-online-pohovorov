import os
import sys
import tkinter as tk
from tkinter import messagebox, ttk
import logging
import easygui
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg


os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
logging.getLogger("tensorflow").setLevel(logging.ERROR)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rozpoznavanie_reci import spusti_vsetko as spusti_rec
from rozpoznavanie_reci.graf_hodnotenia_reci import graf_hodnotenia_reci
from progress import ProgressRunner
from rozpoznavanie_reci.graf_hodnotenia_reci import graf_hodnotenia_reci
from rozpoznanie_tvare.graf_hodnotenia_tvare import graf_hodnotenia_tvare


graf_canvas = None


def zobraz_graf_v_okne(graf_funkcia, subor_nazov=None):
	"""Vloží graf vytvorený existujúcou funkciou do hlavného okna."""
	global graf_canvas

	povodne_show = plt.show
	plt.show = lambda *args, **kwargs: None
	existujuce_grafy = set(plt.get_fignums())
	try:
		vysledok = graf_funkcia(subor_nazov)
	finally:
		plt.show = povodne_show

	if vysledok != 0:
		return

	nove_grafy = set(plt.get_fignums()) - existujuce_grafy
	if not nove_grafy:
		return

	figura = plt.figure(max(nove_grafy))
	manager = figura.canvas.manager
	if manager is not None:
		figura._axobservers.disconnect("_axes_change_event")
		okno = getattr(manager, "window", None)
		if okno is not None and okno.winfo_exists():
			okno.destroy()
		from matplotlib._pylab_helpers import Gcf
		Gcf.figs.pop(manager.num, None)

	if graf_canvas is not None:
		graf_canvas.get_tk_widget().destroy()

	graf_canvas = FigureCanvasTkAgg(figura, master=graf_frame)
	graf_canvas.draw()
	graf_canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)


def zavri_graf() -> None:
	global graf_canvas

	if graf_canvas is None:
		return

	graf_canvas.figure.clear()
	graf_canvas.get_tk_widget().destroy()
	graf_canvas = None


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
		on_complete=lambda result, _error: zobraz_graf_v_okne(
			graf_hodnotenia_reci, result
		),
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
			on_complete=lambda result, _error: zobraz_graf_v_okne(
				graf_hodnotenia_tvare, result
			),
		)
	except ModuleNotFoundError as chyba:
		if chyba.name != "deepface":
			raise
		messagebox.showerror(
			"Chýba DeepFace",
			"DeepFace nie je nainštalovaný v tomto Pythone.\n"
			"Spustite aplikáciu Pythonom 3.12 alebo nainštalujte DeepFace.",
		)

	def spusti_graf_hodnotenia_reci(result):
		graf_hodnotenia_reci(result)

	def spusti_graf_hodnotenia_tvare(result):
		graf_hodnotenia_tvare(result)

root = tk.Tk()
root.title("Moje grafické rozhranie")
root.geometry("800x600")

ovladaci_panel = tk.Frame(root)
ovladaci_panel.pack(fill=tk.X, padx=10, pady=(10, 0))

tlacitkoRozpoznanieReci = tk.Button(
	ovladaci_panel,
	text="Spustiť proces rozpoznávania reči",
	command=spusti_rozpoznavanie_reci,
)
tlacitkoRozpoznanieReci.pack(side=tk.LEFT, padx=(0, 5))
tlacitkoRozpoznanieTvare = tk.Button(
	ovladaci_panel,
	text="Spustiť proces rozpoznávania tvár",
	command=spusti_rozpoznavanie_tvare,
)
tlacitkoRozpoznanieTvare.pack(side=tk.LEFT, padx=5)
tk.Button(ovladaci_panel, text="Zavri graf", command=zavri_graf).pack(
	side=tk.LEFT, padx=5
)

graf_frame = tk.Frame(root)
graf_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)


def ukonci_aplikaciu() -> None:
	try:
		zavri_graf()
		plt.close("all")
	except ImportError:
		pass
	root.destroy()


root.protocol("WM_DELETE_WINDOW", ukonci_aplikaciu)

menu=tk.Menu(root)
root.config(menu=menu)

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

grafmenu=tk.Menu(menu)
menu.add_cascade(label="Grafy",menu=grafmenu)
grafmenu.add_command(
	label="Graf hodnotenia reči",
	command=lambda: zobraz_graf_v_okne(graf_hodnotenia_reci),
)
grafmenu.add_command(
	label="Graf hodnotenia tvár",
	command=lambda: zobraz_graf_v_okne(graf_hodnotenia_tvare),
)


root.mainloop()