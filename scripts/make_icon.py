import sys
from pathlib import Path

from PIL import Image


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("用法: make_icon.py <source.png> <target.ico>")
    source, target = (Path(value) for value in sys.argv[1:3])
    image = Image.open(source).convert("RGBA")
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(
        target,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    main()
