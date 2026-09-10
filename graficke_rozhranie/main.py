import os
import sys
import tkinter as tk
from tkinter import messagebox
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
from rozpoznanie_tvare.graf_hodnotenia_tvare import graf_hodnotenia_tvare
from rozpoznavanie_reci import odstranenie_vyplnovych_slov
from rozpoznavanie_reci import pridanie_vyplnovych_slov
from rozpoznavanie_reci import odstranenie_vyhladavanch_slov
from rozpoznavanie_reci import pridanie_vyhladavanych_slov
from spustenie_vsetkeho import spusti_hodnotenia
from spustenie_vsetkeho import vsetky_grafy


graf_canvas = None


def vymaz_grafy() -> None:
	global graf_canvas
	
	if graf_canvas is not None:
		canvas_list = graf_canvas if isinstance(graf_canvas, list) else [graf_canvas]
		for canvas in canvas_list:
			try:
				plt.close(canvas.figure)
			except Exception:
				pass
			try:
				canvas.get_tk_widget().destroy()
			except Exception:
				pass
		graf_canvas = None
	
	for widget in graf_frame.winfo_children():
		widget.destroy()
	tlacitkoZavriGraf.pack_forget()

def zavri_graf() -> None:
	vymaz_grafy()

def vytvor_figuru_pre_funkciu(graf_funkcia, subor_nazov):
	povodne_show = plt.show
	plt.show = lambda *args, **kwargs: None
	existujuce_grafy = set(plt.get_fignums())
	try:
		stav = graf_funkcia(subor_nazov)
	finally:
		plt.show = povodne_show
		
	if stav != 0:
		return None
		
	nove_grafy = list(set(plt.get_fignums()) - existujuce_grafy)
	if not nove_grafy:
		return None
		
	figura = plt.figure(max(nove_grafy))
	manager = figura.canvas.manager
	if manager is not None:
		try:
			figura._axobservers.disconnect("_axes_change_event")
		except Exception:
			pass
		okno = getattr(manager, "window", None)
		if okno is not None and okno.winfo_exists():
			okno.destroy()
		from matplotlib._pylab_helpers import Gcf
		Gcf.figs.pop(manager.num, None)
		
	return figura

def zobraz_graf_v_okne(graf_funkcia, subor_nazov=None):
	"""Vloží graf vytvorený existujúcou funkciou do hlavného okna."""
	global graf_canvas
	figura = vytvor_figuru_pre_funkciu(graf_funkcia, subor_nazov)
	if figura is None:
		return
	
	vymaz_grafy()
	graf_canvas = FigureCanvasTkAgg(figura, master=graf_frame)
	graf_canvas.draw()
	graf_canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
	tlacitkoZavriGraf.pack(side=tk.LEFT, padx=5)

def zobraz_oba_grafy_v_okne(kombinovany_subor=None):
	from spustenie_vsetkeho.vsetky_grafy import vsetky_grafy
	figura = vytvor_figuru_pre_funkciu(vsetky_grafy, kombinovany_subor)
	
	vymaz_grafy()
	global graf_canvas
	
	if figura:
		graf_canvas = FigureCanvasTkAgg(figura, master=graf_frame)
		graf_canvas.draw()
		graf_canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
		
		tlacitkoZavriGraf.pack(side=tk.LEFT, padx=5)

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

def odstranit_vyplnove_slova() -> None:
	odstranenie_vyplnovych_slov.main()

def pridat_vyplnove_slova() -> None:
	pridanie_vyplnovych_slov.main()

def odstranit_vyhladavane_slova() -> None:
	odstranenie_vyhladavanch_slov.main()

def pridat_vyhladavane_slova() -> None:
	pridanie_vyhladavanych_slov.main()

def spusti_paralelne() -> None:
	video_subor = easygui.fileopenbox(
		title="Vyberte video na paralelné spracovanie",
		filetypes=["*.mp4", "*.avi", "*.mov"],
	)
	if not video_subor:
		return

	def task(report):
		try:
			from spustenie_vsetkeho import spusti_hodnotenia
			return spusti_hodnotenia.spusti_paralelne(
				video_subor=video_subor,
				progress_callback=report,
				show_graph=False
			)
		except RuntimeError as e:
			import traceback
			traceback.print_exc()
			raise Exception(str(e))

	progress_runner.run(
		task,
		"Paralelné spracovanie",
		on_complete=lambda result, error: zobraz_oba_grafy_v_okne(result) if not error and result else None
	)


root = tk.Tk()
root.title("Moje grafické rozhranie")
root.geometry("800x600")

ovladaci_panel = tk.Frame(root)
ovladaci_panel.pack(fill=tk.X, padx=10, pady=(10, 0))
##Tlačidtka

tlacitkoRozpoznanieReci = tk.Button(ovladaci_panel,text="Spustiť proces rozpoznávania reči",command=spusti_rozpoznavanie_reci,)
tlacitkoRozpoznanieReci.pack(side=tk.LEFT, padx=(0, 5))
tlacitkoRozpoznanieTvare = tk.Button(ovladaci_panel,text="Spustiť proces rozpoznávania tvár",command=spusti_rozpoznavanie_tvare,)
tlacitkoRozpoznanieTvare.pack(side=tk.LEFT, padx=5)
tlacitkoSpustiVsetko=tk.Button(ovladaci_panel,text="Spusti oba procesy",command=spusti_paralelne,)
tlacitkoSpustiVsetko.pack(side=tk.LEFT)
tlacitkoZavriGraf = tk.Button(ovladaci_panel, text="Zavri graf", command=zavri_graf)

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

progress_runner = ProgressRunner(root,controls=[tlacitkoRozpoznanieReci, tlacitkoRozpoznanieTvare],)

##Menu

filemenu=tk.Menu(menu)
menu.add_cascade(label="Súbor",menu=filemenu)
filemenu.add_command(label="Ukončiť",command=root.quit)
filemenu.add_command(label="O programe",command=lambda: messagebox.showinfo("O programe","Toto je jednoduché grafické rozhranie pre rozpoznávanie reči a tvár."))

helpmenu=tk.Menu(menu)
menu.add_cascade(label="Pomoc",menu=helpmenu)
helpmenu.add_command(label="O programe",command=lambda: messagebox.showinfo("O programe","Toto je jednoduché grafické rozhranie pre rozpoznávanie reči a tvár."))

spusteniemenu=tk.Menu(menu)
menu.add_cascade(label="Paralelne",menu=spusteniemenu)
spusteniemenu.add_command(label="Paralelné spracovanie",command=spusti_paralelne)

ratingmenu=tk.Menu(menu)
menu.add_cascade(label="Hodnotenie",menu=ratingmenu)
ratingmenu.add_command(label="Rozpoznanie reči",command=spusti_rozpoznavanie_reci)
ratingmenu.add_command(label="Rozpoznanie tváre",command=spusti_rozpoznavanie_tvare)

grafmenu=tk.Menu(menu)
menu.add_cascade(label="Grafy",menu=grafmenu)
grafmenu.add_command(label="Graf hodnotenia reči",command=lambda: zobraz_graf_v_okne(graf_hodnotenia_reci))
grafmenu.add_command(label="Graf hodnotenia tvár",command=lambda: zobraz_graf_v_okne(graf_hodnotenia_tvare))
grafmenu.add_command(label="Všetky grafy",command=lambda: zobraz_oba_grafy_v_okne())

pridanieSlovmenu=tk.Menu(menu)
menu.add_cascade(label="Pridanie slov",menu=pridanieSlovmenu)
pridanieSlovmenu.add_command(label="Pridanie výplňových slov",command=pridat_vyplnove_slova)
pridanieSlovmenu.add_command(label="Pridanie vyhľadávaných slov",command=pridat_vyhladavane_slova)

odstranenieSlovmenu=tk.Menu(menu)
menu.add_cascade(label="Odstránenie slov",menu=odstranenieSlovmenu)
odstranenieSlovmenu.add_command(label="Odstránenie výplňových slov",command=odstranit_vyplnove_slova)
odstranenieSlovmenu.add_command(label="Odstránenie vyhľadávaných slov",command=odstranit_vyhladavane_slova)



root.mainloop()