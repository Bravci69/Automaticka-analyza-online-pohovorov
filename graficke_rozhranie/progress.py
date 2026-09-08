import threading
import tkinter as tk
import traceback
from queue import Empty, Queue
from collections.abc import Callable
from tkinter import messagebox, ttk
from typing import Any


ProgressCallback = Callable[[str, float], None]
ProgressTask = Callable[[ProgressCallback], Any]
CompletionCallback = Callable[[Any, Exception | None], None]


class ProgressRunner:
    """Všeobecný runner pre dlhé úlohy s Tkinter progress oknom.

    Ľubovoľná úloha má tvar ``task(report)``. Úloha môže priebeh hlásiť cez
    ``report("stav", percenta)`` alebo callback vôbec nepoužiť.
    """

    def __init__(
        self,
        root: tk.Misc,
        progressbar: ttk.Progressbar | None = None,
        status_var: tk.StringVar | None = None,
        controls: list[tk.Widget] | None = None,
    ) -> None:
        self.root = root
        self.progressbar = progressbar
        self.status_var = status_var
        self.controls = controls or []
        self._running = False

    @property
    def running(self) -> bool:
        return self._running

    def run(
        self,
        task: ProgressTask,
        title: str = "Spracovávanie",
        on_complete: CompletionCallback | None = None,
    ) -> None:
        """Spustí ľubovoľnú úlohu v background vlákne.

        Príklad úlohy s priebehom::

            def task(report):
                report("Krok 1", 50)
                return moja_funkcia()

        Úloha bez priebehu sa pripojí jednoducho cez
        ``lambda _report: moja_funkcia()``.
        """
        if self._running:
            return

        self._running = True
        self._set_controls_enabled(False)
        window = tk.Toplevel(self.root)
        window.title(title)
        window.geometry("420x125")
        window.resizable(False, False)
        window.transient(self.root)
        window.grab_set()

        status_var = tk.StringVar(value=f"{title}...")
        ttk.Label(window, textvariable=status_var).pack(pady=(18, 8))
        progressbar = ttk.Progressbar(window, mode="determinate", maximum=100, length=350)
        progressbar.pack()
        percent_var = tk.StringVar(value="0 %")
        ttk.Label(window, textvariable=percent_var).pack(pady=(6, 0))
        events: Queue[tuple[str, Any]] = Queue()

        def worker() -> None:
            result = None
            error: Exception | None = None
            try:
                result = task(lambda message, percent: self.report(
                    events, message, percent
                ))
            except Exception as exception:
                error = exception
            events.put(("finish", (result, error)))

        self.root.after(50, lambda: threading.Thread(target=worker, daemon=True).start())
        self._poll_events(
            title,
            window,
            status_var,
            percent_var,
            progressbar,
            events,
            on_complete,
        )

    def report(
        self,
        events: Queue[tuple[str, Any]],
        message: str,
        percent: float,
    ) -> None:
        events.put(("progress", (message, percent)))

    def _poll_events(
        self,
        title: str,
        window: tk.Toplevel,
        status_var: tk.StringVar,
        percent_var: tk.StringVar,
        progressbar: ttk.Progressbar,
        events: Queue[tuple[str, Any]],
        on_complete: CompletionCallback | None,
    ) -> None:
        try:
            while True:
                event, payload = events.get_nowait()
                if event == "progress":
                    message, percent = payload
                    bounded_percent = max(0.0, min(100.0, percent))
                    status_var.set(message)
                    percent_var.set(f"{bounded_percent:.0f} %")
                    progressbar.configure(value=bounded_percent)
                elif event == "finish":
                    result, error = payload
                    self._finish(title, result, error, window, on_complete)
                    return
        except Empty:
            pass
        except Exception as exception:
            self._finish(title, None, exception, window, on_complete)
            return

        if window.winfo_exists():
            self.root.after(
                50,
                self._poll_events,
                title,
                window,
                status_var,
                percent_var,
                progressbar,
                events,
                on_complete,
            )

    def _finish(
        self,
        title: str,
        result: Any,
        error: Exception | None,
        window: tk.Toplevel,
        on_complete: CompletionCallback | None,
    ) -> None:
        self._running = False
        self._set_controls_enabled(True)
        window.grab_release()
        window.destroy()

        if error is not None:
            if self.status_var is not None:
                self.status_var.set(f"{title}: chyba")
            error_text = f"{type(error).__name__}: {error!r}"
            print(f"[{title}] {error_text}")
            traceback.print_exception(type(error), error, error.__traceback__)
            messagebox.showerror("Chyba", error_text, parent=self.root)

        if on_complete is not None and error is None:
            try:
                on_complete(result, None)
            except Exception as exception:
                error_text = f"{type(exception).__name__}: {exception!r}"
                print(f"[{title}] {error_text}")
                traceback.print_exception(
                    type(exception), exception, exception.__traceback__
                )
                messagebox.showerror("Chyba", error_text, parent=self.root)

    def _set_controls_enabled(self, enabled: bool) -> None:
        state = "normal" if enabled else "disabled"
        for control in self.controls:
            control.configure(state=state)
