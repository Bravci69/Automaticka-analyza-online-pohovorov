from pathlib import Path

import easygui

SUBOR = Path(__file__).parent / "vyplnove-slova.voxlens"

def vymazanie_rovnakych_riadkov(text: str) -> str:
    """Odstráni duplicitné riadky zo zadaného textu."""
    riadky = text.splitlines()
    unikatne_riadky = list(dict.fromkeys(riadky))
    return "\n".join(unikatne_riadky)

def main() -> None:
	text = easygui.textbox(
		msg="Zadajte nové slová, každé na samostatný riadok:",
		title="Pridanie výplňových slov",
	)
	if text is None:
		print("Pridávanie bolo zrušené.")
		return

	slova = [riadok.strip() for riadok in text.splitlines() if riadok.strip()]

	if not slova:
		print("Neboli zadané žiadne slová.")
		return

	existujuce = SUBOR.read_text(encoding="utf-8") if SUBOR.exists() else ""
	spojene_slova = "\n".join(filter(None, [existujuce.strip(), "\n".join(slova)]))
	novy_obsah = vymazanie_rovnakych_riadkov(spojene_slova)
	SUBOR.write_text(novy_obsah, encoding="utf-8")

	print(f"Úspešne pridaných slov: {len(slova)}")


if __name__ == "__main__":
	main()
