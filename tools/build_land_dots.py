"""Bakes Natural Earth land (world-atlas land-110m TopoJSON) into evenly spaced globe dots.

  curl -sL -o land-110m.json https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json
  python3 tools/build_land_dots.py land-110m.json models/land-dots.json

Output: flat [lat, lon, lat, lon, ...] array in degrees, one decimal place.
"""
import json
import math
import sys

src, out = sys.argv[1], sys.argv[2]
topo = json.load(open(src))
sx, sy = topo["transform"]["scale"]
tx, ty = topo["transform"]["translate"]

# Decode delta-encoded, quantised arcs into lon/lat.
arcs = []
for arc in topo["arcs"]:
    x = y = 0
    pts = []
    for dx, dy in arc:
        x += dx
        y += dy
        pts.append((x * sx + tx, y * sy + ty))
    arcs.append(pts)


def ring(indices):
    pts = []
    for i in indices:
        a = arcs[i] if i >= 0 else arcs[~i][::-1]
        pts.extend(a if not pts else a[1:])
    # Unwrap rings that cross the antimeridian (Fiji, Chukotka) so they stay compact.
    out = [pts[0]]
    for lon, lat in pts[1:]:
        prev = out[-1][0]
        while lon - prev > 180:
            lon -= 360
        while lon - prev < -180:
            lon += 360
        out.append((lon, lat))
    return out


polygons = []
for geom in topo["objects"]["land"]["geometries"]:
    polys = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
    for poly in polys:
        rings = [ring(r) for r in poly]
        xs = [p[0] for p in rings[0]]
        ys = [p[1] for p in rings[0]]
        polygons.append((min(xs), max(xs), min(ys), max(ys), rings))


def inside(lon, lat, pts):
    hit = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def is_land(lon, lat):
    for x0, x1, y0, y1, rings in polygons:
        for test in (lon, lon - 360, lon + 360):
            if x0 <= test <= x1 and y0 <= lat <= y1 and inside(test, lat, rings[0]):
                return not any(inside(test, lat, hole) for hole in rings[1:])
    return False


N = 16000
golden = math.pi * (3 - math.sqrt(5))
dots = []
for i in range(N):
    y = 1 - (i / (N - 1)) * 2
    theta = golden * i
    lat = math.degrees(math.asin(y))
    lon = math.degrees(math.atan2(math.sin(theta), math.cos(theta)))
    if lat < -60:  # skip Antarctica: it crowds the bottom of the globe
        continue
    if is_land(lon, lat):
        dots += [round(lat, 1), round(lon, 1)]

json.dump(dots, open(out, "w"), separators=(",", ":"))
print(len(dots) // 2, "land dots ->", out)
