#!/usr/bin/env python3
# Rebuilds web/models/guitar.glb from CamSear16's "Guitar Hero Controller" (Sketchfab, CC-BY-4.0).
# Needs numpy and Pillow. SRC must contain, unzipped from the two Sketchfab downloads:
#   source/GuitarHeroController.obj             (from "Original format")
#   textures/Material__26_baseColor.png, textures/Material__26_normal.png   (from "glTF")
#   textures/Material__26_Glossiness.png        (from "Original format")
# usage: python3 tools/model/build_glb.py <SRC> web/models/guitar.glb
import numpy as np

def load(path):
    V=[];T=[];N=[];groups={};cur=None
    for line in open(path):
        if line.startswith('v '): V.append(list(map(float,line.split()[1:4])))
        elif line.startswith('vt '): T.append(list(map(float,line.split()[1:3])))
        elif line.startswith('vn '): N.append(list(map(float,line.split()[1:4])))
        elif line.startswith('g '):
            cur=line.split()[1]; cur=cur[:len(cur)//2] if cur[:len(cur)//2]+'_'+cur[:len(cur)//2]==cur or True else cur
            groups.setdefault(cur,[])
        elif line.startswith('f '):
            idx=[tuple(int(x) if x else 0 for x in p.split('/')) for p in line.split()[1:]]
            for i in range(1,len(idx)-1): groups[cur].append((idx[0],idx[i],idx[i+1]))
    return np.array(V),np.array(T),np.array(N),groups

# OBJ (CamSear16, CC-BY-4.0) -> GLB with the moving parts as separate, pivoted nodes; brand marks removed from the textures.
import json, struct, io, sys, os, numpy as np
from PIL import Image, ImageDraw

SRC = sys.argv[1] if len(sys.argv) > 1 else 'Guitar3DModel'   # folder with both Sketchfab downloads unzipped
OUT = sys.argv[2] if len(sys.argv) > 2 else 'web/models/guitar.glb'
P = lambda *a: os.path.join(SRC, *a)
V, T, N, G = load(P('source', 'GuitarHeroController.obj'))
SCALE = 0.01
ANIM = {   # part -> pivot (model units) ; None = bbox centre
    'fret_Green': None, 'fret_Red': None, 'fret_Yellow': None, 'fret_Blue': None, 'fret_Orange': None,
    'Strummer': None, 'button_Start': None, 'button_Back': None,
    'whammy_Bar': (-117.4, 13.6, 22.8),
}
CHROME = {'whammy_Bar', 'whammy_Rotator', 'Tuner001', 'Tuner002', 'Tuner003', 'Tuner004', 'Tuner005', 'Tuner006', 'strap_Lock001', 'strap_Lock002', 'strap_Lock003'}

def build(faces):
    key = {}; pos = []; uv = []; nor = []; idx = []
    for tri in faces:
        for c in tri:
            k = c
            if k not in key:
                key[k] = len(pos)
                pos.append(V[c[0]-1]); uv.append(T[c[1]-1] if c[1] else (0, 0)); nor.append(N[c[2]-1] if len(c) > 2 and c[2] else (0, 1, 0))
            idx.append(key[k])
    uv = np.array(uv, np.float32)   # this export already uses a top-left origin
    n = np.array(nor, np.float32); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    assert len(pos) < 65536
    return np.array(pos, np.float32), uv, n, np.array(idx, np.uint16)

# centre of the whole model
allp = V
centre = (allp.min(0) + allp.max(0)) / 2
centre[1] = allp.min(0)[1]          # sit on y = 0

groups = {}
static = {'body': [], 'chrome': []}
for name, faces in G.items():
    if name in ANIM: groups[name] = faces
    else: static['chrome' if name in CHROME else 'body'].extend(faces)

bin_ = bytearray(); views = []; accessors = []; meshes = []; nodes = []
def add(arr, target, comp, typ, minmax=False):
    while len(bin_) % 4: bin_.append(0)
    off = len(bin_); b = arr.tobytes(); bin_.extend(b)
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b), 'target': target})
    a = {'bufferView': len(views)-1, 'componentType': comp, 'count': len(arr), 'type': typ}
    if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accessors.append(a); return len(accessors)-1

def add_mesh(name, faces, pivot, mat):
    p, uv, n, i = build(faces)
    p = ((p - pivot) * SCALE).astype(np.float32)
    prim = {'attributes': {'POSITION': add(p, 34962, 5126, 'VEC3', True), 'NORMAL': add(n, 34962, 5126, 'VEC3'), 'TEXCOORD_0': add(uv, 34962, 5126, 'VEC2')},
            'indices': add(i, 34963, 5123, 'SCALAR'), 'material': mat}
    meshes.append({'name': name, 'primitives': [prim]})
    nodes.append({'name': name, 'mesh': len(meshes)-1, 'translation': ((np.array(pivot) - centre) * SCALE).tolist()})

add_mesh('body', static['body'], centre, 0)
add_mesh('chrome', static['chrome'], centre, 1)
for name, faces in groups.items():
    ids = np.array([[c[0] for c in t] for t in faces]).ravel() - 1
    pv = ANIM[name] or tuple((V[ids].min(0) + V[ids].max(0)) / 2)
    add_mesh(name, faces, np.array(pv, np.float32), 1 if name in CHROME else 0)

# ---------------- textures
S = 2048
base = Image.open(P('textures', 'Material__26_baseColor.png')).convert('RGB')
d = ImageDraw.Draw(base)
d.rectangle((2620, 400, 2770, 590), fill=(0, 0, 0))             # headstock wordmark
d.rectangle((3290, 3090, 3470, 3310), fill=(0, 0, 0))           # rear label (brand, console, model no.)
cx, cy, r = 1532, 2584, 44                                      # guide button: plain silver dome
for k in range(r, 0, -1):
    t = k / r; g = int(70 + 120 * (1 - t) ** 0.7)
    d.ellipse((cx - k - 6 * (1 - t), cy - k - 6 * (1 - t), cx + k - 6 * (1 - t), cy + k - 6 * (1 - t)), fill=(g, g, g + 6))
# YAGCC look: blue-purple front plate (#5B4EE8) with black trim, everything else as modelled; YAGCC_FACE=rrggbb overrides
FACE = tuple(int(os.environ.get('YAGCC_FACE', '5b4ee8')[i:i + 2], 16) for i in (0, 2, 4))   # front plate colour, hex
fm = Image.new('L', base.size, 0); fd = ImageDraw.Draw(fm)
W, H = base.size
for tri in G['body_Main']:
    p = V[[c[0] - 1 for c in tri]]
    n = np.cross(p[1] - p[0], p[2] - p[0]); L = np.linalg.norm(n)
    if L and n[1] / L > 0.85 and p[:, 1].min() > 11.5:      # faces looking straight up from the top surface
        fd.polygon([(T[c[1] - 1][0] * W, T[c[1] - 1][1] * H) for c in tri], fill=255)
box = Image.new('L', base.size, 0); bd = ImageDraw.Draw(box); bd.rectangle((1300, 1300, 3140, 2660), fill=255); bd.rectangle((2960, 1300, 3140, 1870), fill=0)   # the top's UV island only (not the rim strip beside it)
from PIL import ImageChops, ImageFilter
top_all = fm.filter(ImageFilter.MaxFilter(9))                                                          # every upward face, incl. the top of the rim
fm = ImageChops.multiply(fm.filter(ImageFilter.MaxFilter(5)), box)                                    # grow a little over UV seams
dark = base.convert('L').point(lambda v: 255 if v < 110 else 0)                                          # keep the white binding as it is
fm = ImageChops.multiply(fm, dark)
base.paste(FACE, mask=fm)
# black trim: the white binding around the top becomes black (the guide button stays silver)
TRIM = (18, 18, 20)
trim = ImageChops.multiply(base.convert('L').point(lambda v: 255 if v >= 50 else 0), ImageChops.lighter(box, top_all))
trim = ImageChops.subtract(trim, fm)
ImageDraw.Draw(trim).ellipse((1532 - 70, 2584 - 70, 1532 + 70, 2584 + 70), fill=0)
base.paste(TRIM, mask=trim)
nrm = Image.open(P('textures', 'Material__26_normal.png')).convert('RGB')
patch = nrm.crop((2240, 2820, 2640, 3210))                      # clean grain beside the embossed logo
nrm.paste(patch, (2650, 2820))
nd = ImageDraw.Draw(nrm); nd.rectangle((2620, 400, 2770, 590), fill=(128, 128, 255))
gloss = Image.open(P('textures', 'Material__26_Glossiness.png')).convert('L').resize((S, S), Image.LANCZOS)
rough = np.array(gloss, np.float32)
mr = np.zeros((S, S, 3), np.uint8); mr[..., 1] = np.clip(255 - rough, 0, 255).astype(np.uint8)
imgs = []
def img(im, q=88):
    bio = io.BytesIO(); im.resize((S, S), Image.LANCZOS).save(bio, 'JPEG', quality=q, optimize=True, progressive=False)
    b = bio.getvalue()
    while len(bin_) % 4: bin_.append(0)
    off = len(bin_); bin_.extend(b)
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b)})
    imgs.append({'bufferView': len(views)-1, 'mimeType': 'image/jpeg'}); return len(imgs)-1
ib = img(base, 90); inn = img(nrm, 88); imr = img(Image.fromarray(mr), 85)
textures = [{'source': ib, 'sampler': 0}, {'source': inn, 'sampler': 0}, {'source': imr, 'sampler': 0}]
mat = lambda name, metal: {'name': name, 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicRoughnessTexture': {'index': 2}, 'metallicFactor': metal, 'roughnessFactor': 1.0},
                           'normalTexture': {'index': 1}}
gltf = {
    'asset': {'version': '2.0', 'generator': 'YAGCC build.py',
              'copyright': 'Based on "Guitar Hero Controller" by CamSear16 (https://sketchfab.com/CamSear16), CC-BY-4.0. Modified for YAGCC: parts split and pivoted, brand marks removed.'},
    'scene': 0, 'scenes': [{'nodes': [len(nodes)]}],
    'nodes': nodes + [{'name': 'guitar', 'children': list(range(len(nodes)))}],
    'meshes': meshes, 'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}],
    'materials': [mat('plastic', 0.0), mat('chrome', 0.85)],
    'textures': textures, 'images': imgs, 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
}
js = json.dumps(gltf, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
while len(bin_) % 4: bin_.append(0)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
open(OUT, 'wb').write(out)
print('glb', len(out), 'nodes', [n['name'] for n in nodes])
