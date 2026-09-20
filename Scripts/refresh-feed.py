#!/usr/bin/env python3
"""Rewrite the sha512 and size of every file named in latest-mac.yml.

electron-builder writes the manifest when it builds the artefacts, and the
disk image is stapled afterwards: stapling appends the notarisation ticket, so
the file grows by a couple of kilobytes and its hash changes. The manifest then
describes a file that no longer exists.

It does not break updates today, because electron-updater follows `path:`,
which points at the zip, and the zip is not stapled. It is still wrong data
being served, and the day anything reads the dmg entry it would reject a
perfectly good image.

Run after stapling, before uploading.
"""
import base64
import hashlib
import pathlib
import re
import sys


def digest(path: pathlib.Path) -> str:
    h = hashlib.sha512()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return base64.b64encode(h.digest()).decode()


def main(directory: str) -> int:
    d = pathlib.Path(directory)
    feed = d / "latest-mac.yml"
    if not feed.exists():
        print(f"no {feed}", file=sys.stderr)
        return 1

    text = feed.read_text()
    changed = []

    # Each entry is "- url: NAME", then sha512, then size, in that order.
    def fix_entry(m: re.Match) -> str:
        name = m.group("name")
        target = d / name
        if not target.exists():
            print(f"  {name}: named in the feed and not on disk", file=sys.stderr)
            return m.group(0)
        sha, size = digest(target), target.stat().st_size
        if sha != m.group("sha") or str(size) != m.group("size"):
            changed.append(name)
        # The sibling keys of a list item line up with the first key, which
        # sits two columns after the dash. Indenting them relative to the dash
        # instead produces a file that is no longer the same shape.
        indent = m.group("indent")
        keys = " " * (len(indent) + 2)
        return (f'{indent}- url: {name}\n'
                f'{keys}sha512: {sha}\n'
                f'{keys}size: {size}')

    text = re.sub(
        r'(?P<indent>[ ]*)- url: (?P<name>\S+)\n'
        r'[ ]*sha512: (?P<sha>\S+)\n'
        r'[ ]*size: (?P<size>\d+)',
        fix_entry, text)

    # The top level sha512 and path describe whichever file the updater
    # downloads, so they have to agree with that file's entry.
    top = re.search(r'^path: (?P<name>\S+)$', text, re.M)
    if top:
        target = d / top.group("name")
        if target.exists():
            text = re.sub(r'^sha512: \S+$', f'sha512: {digest(target)}', text, flags=re.M)

    feed.write_text(text)
    for name in changed:
        print(f"  corrected {name}")
    if not changed:
        print("  the feed already matched every file")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else "desktop/dist"))
