from pathlib import Path
import easygui

SUBOR = Path(__file__).resolve().parent / "vyplnove-slova.voxlens"

def nacitaj_slova() -> list[str]:
    if not SUBOR.exists():
        raise SystemExit(f"Súbor '{SUBOR}' neexistuje.")

    return [riadok.strip() for riadok in SUBOR.read_text(encoding="utf-8").splitlines() if riadok.strip()]


def main() -> None:
    slova = nacitaj_slova()
    if not slova:
        print("Súbor neobsahuje žiadne slová.")
        return

    vybrane_slova = easygui.multchoicebox(
        msg="Vyberte slová, ktoré chcete odstrániť:",
        title="Odstránenie výplňových slov",
        choices=slova,
    )
    if not vybrane_slova:
        print("Neboli vybrané žiadne slová.")
        return

    vybrane = set(vybrane_slova)
    zostavajuce_slova = [slovo for slovo in slova if slovo not in vybrane]
    SUBOR.write_text("\n".join(zostavajuce_slova), encoding="utf-8")
    print(f"Úspešne odstránených slov: {len(vybrane_slova)}")


if __name__ == "__main__":
    main()
