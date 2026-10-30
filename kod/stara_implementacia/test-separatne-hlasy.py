from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import easygui


_DIARIZACIA_PATH = Path(__file__).with_name("test-deriarizacia.py")
_DIARIZACIA_SPEC = spec_from_file_location("test_deriarizacia", _DIARIZACIA_PATH)
if _DIARIZACIA_SPEC is None or _DIARIZACIA_SPEC.loader is None:
    raise ImportError(f"Nepodarilo sa načítať modul '{_DIARIZACIA_PATH}'.")
_DIARIZACIA = module_from_spec(_DIARIZACIA_SPEC)
_DIARIZACIA_SPEC.loader.exec_module(_DIARIZACIA)


def main() -> None:
    input_path = easygui.fileopenbox(
        title="Vyberte WAV audio súbor",
        filetypes=["*.wav"],
    )
    if not input_path:
        print("[INFO] Nebol vybraný žiadny audio súbor.")
        return

    output_dir = str(Path(__file__).resolve().parent)

    speaker_count = easygui.integerbox(
        msg="Koľko rečníkov sa má hľadať?",
        title="Počet rečníkov",
        default=2,
        lowerbound=1,
    )
    if speaker_count is None:
        return
    _DIARIZACIA.run_builtin_diarization(input_path, output_dir, speaker_count=speaker_count)


if __name__ == "__main__":
    main()
