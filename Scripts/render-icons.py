#!/usr/bin/env python3
"""Render site/brand/mark.svg into every icon the site and the application ask
for, and build favicon.ico from the results.

The mark is SVG and that is the source of truth. These PNGs exist because
Safari still wants an apple-touch-icon, Android wants a 192 for the home
screen, and a favicon.ico is what a browser guesses at when it finds nothing
else. Editing a PNG by hand instead of the SVG puts the set out of step, so
run this after any change to the mark.

Chrome does the rasterising. It is the only renderer installed, and it draws
the file the same way the browsers that will show it do.

    python3 Scripts/render-icons.py
"""

import pathlib
import struct
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
BRAND = ROOT / "site" / "brand"
CHROME = pathlib.Path(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
)

# (source mark, output, pixel size). The Apple icon comes from the square
# cornered mark; everything else keeps the rounded corner.
TARGETS = [
    ("mark.svg", BRAND / "icon-32.png", 32),
    ("mark.svg", BRAND / "icon-192.png", 192),
    ("mark.svg", BRAND / "icon-512.png", 512),
    ("mark-square.svg", BRAND / "icon-180.png", 180),
]

# What goes inside favicon.ico. 48 is there for Windows shortcuts and for the
# few places that still upscale from the largest entry.
ICO_SIZES = [16, 32, 48]


def render(svg: pathlib.Path, out: pathlib.Path, px: int, work: pathlib.Path,
           announce: bool = True):
    """Screenshot the SVG at exactly px by px, transparent behind it."""
    page = work / "page.html"
    page.write_text(
        '<!doctype html><meta charset="utf-8">'
        "<style>html,body{margin:0;padding:0;background:transparent}"
        f"svg{{display:block;width:{px}px;height:{px}px}}</style>"
        + svg.read_text()
    )
    shot = work / "shot.png"
    subprocess.run(
        [
            str(CHROME),
            "--headless",
            "--disable-gpu",
            "--hide-scrollbars",
            "--default-background-color=00000000",
            "--force-device-scale-factor=1",
            f"--window-size={px},{px}",
            f"--screenshot={shot}",
            page.as_uri(),
        ],
        check=True,
        capture_output=True,
    )
    out.write_bytes(shot.read_bytes())
    shot.unlink()
    if announce:
        print(f"  {out.relative_to(ROOT)}  {px}x{px}")


def build_ico(pngs, out: pathlib.Path):
    """Write an .ico whose entries are whole PNG files.

    The format allows that since Vista and every browser in use reads it, and
    it avoids hand rolling a BMP with an AND mask for the transparency.
    """
    count = len(pngs)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    entries, blobs = b"", b""
    for size, data in pngs:
        entries += struct.pack(
            "<BBBBHHII",
            0 if size >= 256 else size,   # 0 means 256
            0 if size >= 256 else size,
            0,                            # palette, 0 for truecolour
            0,                            # reserved
            1,                            # colour planes
            32,                           # bits per pixel
            len(data),
            offset,
        )
        blobs += data
        offset += len(data)
    out.write_bytes(header + entries + blobs)
    print(f"  {out.relative_to(ROOT)}  {' '.join(str(s) for s, _ in pngs)}")


def main():
    if not CHROME.exists():
        raise SystemExit(f"Chrome not found at {CHROME}")

    print("rendering:")
    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        for name, out, px in TARGETS:
            render(BRAND / name, out, px, work)

        ico = []
        for size in ICO_SIZES:
            path = work / f"ico-{size}.png"
            render(BRAND / "mark.svg", path, size, work, announce=False)
            ico.append((size, path.read_bytes()))
        build_ico(ico, ROOT / "site" / "favicon.ico")


if __name__ == "__main__":
    main()
