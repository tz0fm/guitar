#!/usr/bin/env python3
"""Render the Guitar app icon as PNG with no dependencies (stdlib only).

Usage: python3 tools/make_icons.py public/icons
Writes icon-512.png; smaller sizes are made with macOS `sips`.
"""
import os
import struct
import subprocess
import sys
import zlib

SIZE = 512
SS = 3  # supersampling per axis


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


BG_TOP, BG_BOTTOM = hex_rgb('#262b3b'), hex_rgb('#111318')
ORANGE, RED = hex_rgb('#ff8a3d'), hex_rgb('#ff453a')
LINE, NUT = hex_rgb('#8b909c'), hex_rgb('#f5f2ee')

# A chord diagram (a C major shape): 6 strings, 4 frets, a nut, dots, red root.
X0, X1 = 0.22, 0.78          # outer strings
Y0, Y1 = 0.24, 0.84          # nut .. 4th fret
STRINGS = [X0 + i * (X1 - X0) / 5 for i in range(6)]
FRETS = [Y0 + i * (Y1 - Y0) / 4 for i in range(5)]
FRET_H = (Y1 - Y0) / 4
DOT_R = 0.047
# (string index, fret) for C major x32010
DOTS = [(1, 3), (2, 2), (4, 1)]
ROOT = (1, 3)


def dot_center(s, f):
    return STRINGS[s], Y0 + (f - 0.5) * FRET_H


def color_at(x, y):
    for s, f in DOTS:
        cx, cy = dot_center(s, f)
        if (x - cx) ** 2 + (y - cy) ** 2 < DOT_R ** 2:
            return RED if (s, f) == ROOT else ORANGE
    if X0 - 0.012 <= x <= X1 + 0.012 and Y0 - 0.035 <= y <= Y0:
        return NUT
    if X0 - 0.006 <= x <= X1 + 0.006 and Y0 <= y <= Y1 + 0.006:
        if any(abs(y - fy) < 0.006 for fy in FRETS[1:]):
            return LINE
        if any(abs(x - sx) < 0.0065 for sx in STRINGS):
            return LINE
    return tuple(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * y for i in range(3))


def write_png(path, size, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)

    def chunk(kind, data):
        return (struct.pack('>I', len(data)) + kind + data +
                struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF))

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(chunk(b'IEND', b''))


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'public/icons'
    os.makedirs(out, exist_ok=True)
    rows = []
    n = SS * SS
    for py in range(SIZE):
        row = []
        for px in range(SIZE):
            r = g = b = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    c = color_at((px + (sx + 0.5) / SS) / SIZE, (py + (sy + 0.5) / SS) / SIZE)
                    r += c[0]; g += c[1]; b += c[2]
            row += [round(r / n), round(g / n), round(b / n)]
        rows.append(row)
    big = os.path.join(out, 'icon-512.png')
    write_png(big, SIZE, rows)
    for s in (192, 180):
        subprocess.run(['sips', '-z', str(s), str(s), big, '--out',
                        os.path.join(out, f'icon-{s}.png')], check=True, capture_output=True)
    print('icons written to', out)


if __name__ == '__main__':
    main()
