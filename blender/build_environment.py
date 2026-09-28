"""Procedurally models the beasley.dev environment and exports models/environment.glb.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P blender/build_environment.py

Named objects the site picks out of the GLB:
  Skyline        financial-district amphitheatre around the chart (Building)
  Tower_0..4     standalone towers for the Bull Run city canyon (Building)
  ServerStack    prop-firm CRM: a rack of platform servers (Holo)
  RiskGauge      risk dial with tick marks (Holo)
  GaugeNeedle    the dial's needle, pivot at origin (Holo)
  Jet            Bull Run fighter (Holo + Engine)
Blender is Z-up; the glTF exporter converts to Y-up.
"""

import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "environment.glb")
random.seed(11)

bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, emission=0.0):
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 0.4
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


MAT_BUILDING = material("Building", (0.05, 0.03, 0.09))
MAT_HOLO = material("Holo", (0.42, 0.18, 0.95), 0.4)
MAT_ENGINE = material("Engine", (0.8, 0.6, 1.0), 4.0)


def link(bm, name, mat):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def join(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]


def cube(bm, center, size, rot_z=0.0):
    m = Matrix.Translation(center) @ Matrix.Rotation(rot_z, 4, "Z") @ Matrix.Diagonal((*size, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


# ---------- Buildings ----------

def tower(bm, base, width, depth, height, rot):
    """A skyscraper: main shaft, optional setbacks, crown and spire."""
    style = random.random()
    h = height
    if style < 0.45:
        # Setback tower: shrinking tiers.
        tiers = random.randint(2, 4)
        z = 0.0
        w, d = width, depth
        for t in range(tiers):
            th = h * (0.55 if t == 0 else 0.45 / (tiers - 1))
            cube(bm, base + Vector((0, 0, z + th / 2)), (w, d, th), rot)
            z += th
            w *= random.uniform(0.62, 0.8)
            d *= random.uniform(0.62, 0.8)
        top = z
    elif style < 0.75:
        # Slab with a crown.
        cube(bm, base + Vector((0, 0, h / 2)), (width, depth, h), rot)
        cube(bm, base + Vector((0, 0, h + 0.25)), (width * 0.85, depth * 0.85, 0.5), rot)
        top = h + 0.5
    else:
        # Twin-block with a bridge.
        off = Vector((math.cos(rot), math.sin(rot), 0)) * width * 0.3
        cube(bm, base - off + Vector((0, 0, h / 2)), (width * 0.45, depth, h), rot)
        cube(bm, base + off + Vector((0, 0, h * 0.4)), (width * 0.45, depth, h * 0.8), rot)
        cube(bm, base + Vector((0, 0, h * 0.62)), (width, depth * 0.5, 0.35), rot)
        top = h
    if random.random() < 0.4:
        spire = random.uniform(1.0, 3.0)
        bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.12, radius2=0.0, depth=spire,
                              matrix=Matrix.Translation(base + Vector((0, 0, top + spire / 2))))


# Skyline: 270° amphitheatre; the open side becomes the camera's approach.
bm = bmesh.new()
ARC = math.radians(270)
start = math.radians(-45) - ARC
for band, (radius, hmin, hmax) in enumerate([(27, 3, 8), (31, 5, 13), (36, 7, 19), (42, 9, 24)]):
    a = start
    while a < start + ARC:
        width = random.uniform(1.6, 3.2)
        depth = random.uniform(1.6, 3.0)
        t = (a - start) / ARC
        edge = min(1.0, t * 5, (1 - t) * 5)
        height = random.uniform(hmin, hmax) * (0.35 + 0.65 * edge)
        r = radius + random.uniform(-1.2, 1.2)
        base = Vector((math.cos(a) * r, math.sin(a) * r, 0))
        tower(bm, base, width, depth, height, a + math.pi / 2)
        a += (width + random.uniform(0.4, 1.4)) / r
link(bm, "Skyline", MAT_BUILDING)

# Standalone towers for the game.
for i in range(5):
    bm = bmesh.new()
    tower(bm, Vector((0, 0, 0)), random.uniform(2.2, 3.4), random.uniform(2.2, 3.4), random.uniform(10, 22), 0)
    o = link(bm, f"Tower_{i}", MAT_BUILDING)
    o.location.x = 60 + i * 6

# ---------- Server stack (prop-firm CRM) ----------
bm = bmesh.new()
cube(bm, Vector((0, 0, 0.1)), (1.9, 1.3, 0.2))
for k in range(6):
    z = 0.32 + k * 0.36
    cube(bm, Vector((0, 0, z)), (1.6, 1.0, 0.28))
    # Drive bays proud of the front face.
    for b in range(5):
        cube(bm, Vector((-0.6 + b * 0.3, -0.52, z)), (0.22, 0.06, 0.16))
cube(bm, Vector((0, 0, 2.55)), (1.9, 1.3, 0.12))
for sx in (-1, 1):
    for sy in (-1, 1):
        cube(bm, Vector((sx * 0.88, sy * 0.58, 1.3)), (0.08, 0.08, 2.5))
o = link(bm, "ServerStack", MAT_HOLO)
o.location.x = -8

# ---------- Risk gauge ----------
bm = bmesh.new()
SWEEP = math.radians(240)
# Tick marks, oriented radially; every fifth is a major tick.
for k in range(41):
    a = math.radians(-30) + SWEEP * (k / 40)
    major = k % 5 == 0
    length = 0.38 if major else 0.2
    r = 1.45 - length / 2
    m = Matrix.Translation((math.cos(a) * r, 0, math.sin(a) * r)) @ Matrix.Rotation(-a, 4, "Y") @ Matrix.Diagonal((length, 0.08, 0.09 if major else 0.05, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)
# Outer rim as a segmented arc.
SEG = 48
for k in range(SEG):
    a0 = math.radians(-30) + SWEEP * (k / SEG)
    a1 = math.radians(-30) + SWEEP * ((k + 1) / SEG)
    mid = (a0 + a1) / 2
    seg_len = 1.62 * (a1 - a0)
    m = Matrix.Translation((math.cos(mid) * 1.62, 0, math.sin(mid) * 1.62)) @ Matrix.Rotation(-mid + math.pi / 2, 4, "Y") @ Matrix.Diagonal((seg_len * 1.02, 0.14, 0.1, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)
# Hub.
bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.2, radius2=0.2, depth=0.18,
                      matrix=Matrix.Rotation(math.radians(90), 4, "X"))
o = link(bm, "RiskGauge", MAT_HOLO)
o.location.x = -14

bm = bmesh.new()
v = [bm.verts.new(p) for p in [(0, -0.05, 0.07), (0, -0.05, -0.07), (1.25, -0.05, 0), (-0.25, -0.05, 0.05), (-0.25, -0.05, -0.05)]]
bm.faces.new((v[0], v[2], v[1]))
bm.faces.new((v[0], v[1], v[4], v[3]))
bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
bmesh.ops.translate(bm, verts=[x for x in bm.verts if x.co.y > -0.06 and x not in v], vec=(0, -0.06, 0))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
o = link(bm, "GaugeNeedle", MAT_HOLO)
o.location.x = -14

# ---------- Jet ----------
# Lofted fuselage: hexagonal sections along +Y (nose), then wings, tails, nozzles.
bm = bmesh.new()
SECTIONS = [(-1.3, 0.2, 0.15), (-1.0, 0.3, 0.22), (-0.2, 0.32, 0.26), (0.5, 0.26, 0.24), (1.1, 0.16, 0.15), (1.7, 0.05, 0.05), (1.95, 0.0, 0.0)]
rings = []
for y, w, h in SECTIONS:
    ring = []
    for k in range(6):
        a = k / 6 * math.tau + math.pi / 6
        ring.append(bm.verts.new((math.cos(a) * w, y, math.sin(a) * h)))
    rings.append(ring)
for r0, r1 in zip(rings, rings[1:]):
    for k in range(6):
        j = (k + 1) % 6
        face = (r0[k], r0[j], r1[j], r1[k])
        if r1[k].co == r1[j].co:
            bm.faces.new((r0[k], r0[j], r1[k]))
        else:
            bm.faces.new(face)
bm.faces.new(list(reversed(rings[0])))
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
# Canopy.
bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.13, radius2=0.02, depth=0.7,
                      matrix=Matrix.Translation((0, 0.75, 0.22)) @ Matrix.Rotation(math.radians(-80), 4, "X") @ Matrix.Diagonal((1, 1, 1, 1)))
# Delta wings (thin wedges).
for side in (-1, 1):
    pts = [(side * 0.28, 0.5, 0.0), (side * 1.55, -0.95, -0.05), (side * 1.5, -1.2, -0.05), (side * 0.28, -1.15, 0.0)]
    top = [bm.verts.new((x, y, z + 0.035)) for x, y, z in pts]
    bot = [bm.verts.new((x, y, z - 0.035)) for x, y, z in pts]
    bm.faces.new(top if side > 0 else list(reversed(top)))
    bm.faces.new(list(reversed(bot)) if side > 0 else bot)
    for k in range(4):
        j = (k + 1) % 4
        quad = (top[k], bot[k], bot[j], top[j])
        bm.faces.new(quad if side > 0 else tuple(reversed(quad)))
    # Canted twin tails.
    tp = [(side * 0.2, -0.55, 0.15), (side * 0.55, -1.2, 0.85), (side * 0.5, -1.35, 0.85), (side * 0.2, -1.25, 0.15)]
    tt = [bm.verts.new((x - side * 0.025, y, z)) for x, y, z in tp]
    tb = [bm.verts.new((x + side * 0.025, y, z)) for x, y, z in tp]
    bm.faces.new(tt if side < 0 else list(reversed(tt)))
    bm.faces.new(list(reversed(tb)) if side < 0 else tb)
    for k in range(4):
        j = (k + 1) % 4
        quad = (tt[k], tb[k], tb[j], tt[j])
        bm.faces.new(quad if side < 0 else tuple(reversed(quad)))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
jet = link(bm, "Jet", MAT_HOLO)
jet.location.x = 8

bm = bmesh.new()
for side in (-1, 1):
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.13, radius2=0.09, depth=0.3,
                          matrix=Matrix.Translation((side * 0.12, -1.4, 0)) @ Matrix.Rotation(math.radians(90), 4, "X"))
engines = link(bm, "Jet_engines", MAT_ENGINE)
engines.location.x = 8
join([jet, engines], "Jet")

# ---------- Export ----------
for obj in bpy.data.objects:
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"{obj.name:12s} {tris:6d} tris")

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_apply=True,
    export_yup=True,
    export_materials="EXPORT",
    export_normals=True,
    export_texcoords=False,
    export_cameras=False,
    export_lights=False,
)
print("exported", OUT, os.path.getsize(OUT), "bytes")
