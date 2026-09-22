#!/usr/bin/env python3
"""
Generate the material plates used across the site.

External image hosts are unreachable from this environment and the client's own
product photography was not available, so each plate is a *designed material
study* rather than a stand-in photograph: a base gradient, a light bloom, fine
grain, and a motif drawn from how the material actually behaves. They are
deliberately abstract so nobody mistakes them for a photo of real stock.

Replace any file in public/plates/ with real photography of the same name and
the site picks it up with no code change (see PLATE_EXT in src/components/MaterialPlate.tsx).

    python3 tools/make_plates.py
"""

import math
import pathlib

W, H = 1200, 900
OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "plates"


def head(pid: str, defs: str, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
        f'width="{W}" height="{H}" role="img">'
        f"<defs>{defs}</defs>{body}</svg>"
    )


def grad(pid: str, c1: str, c2: str, angle: int = 135) -> str:
    rad = math.radians(angle)
    x1, y1 = 50 - math.cos(rad) * 50, 50 - math.sin(rad) * 50
    x2, y2 = 50 + math.cos(rad) * 50, 50 + math.sin(rad) * 50
    return (
        f'<linearGradient id="{pid}" x1="{x1:.1f}%" y1="{y1:.1f}%" '
        f'x2="{x2:.1f}%" y2="{y2:.1f}%">'
        f'<stop offset="0%" stop-color="{c1}"/>'
        f'<stop offset="100%" stop-color="{c2}"/></linearGradient>'
    )


def bloom(pid: str, colour: str, cx="38%", cy="30%", r="72%", op=0.55) -> str:
    return (
        f'<radialGradient id="{pid}" cx="{cx}" cy="{cy}" r="{r}">'
        f'<stop offset="0%" stop-color="{colour}" stop-opacity="{op}"/>'
        f'<stop offset="100%" stop-color="{colour}" stop-opacity="0"/>'
        f"</radialGradient>"
    )


def grain(pid: str, freq=0.9, op=0.24) -> str:
    return (
        f'<filter id="{pid}" x="0" y="0" width="100%" height="100%">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="3" seed="7"/>'
        f'<feColorMatrix type="saturate" values="0"/>'
        f'<feComponentTransfer><feFuncA type="linear" slope="{op}"/></feComponentTransfer>'
        f"</filter>"
    )


def veins(pid: str, freq=0.012, scale=110, seed=3) -> str:
    """Turbulence displacement — reads as stone veining or wood figure."""
    return (
        f'<filter id="{pid}" x="-10%" y="-10%" width="120%" height="120%">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq} {freq * 2.4:.4f}" '
        f'numOctaves="4" seed="{seed}" result="t"/>'
        f'<feDisplacementMap in="SourceGraphic" in2="t" scale="{scale}" '
        f'xChannelSelector="R" yChannelSelector="G"/>'
        f"</filter>"
    )


BASE = f'<rect width="{W}" height="{H}"/>'


# Shared finishing pass. A flat gradient reads as a placeholder; a directional
# sheen, a vignette and a lit top edge read as a material sample under a light.
# Applying it to every plate is also what keeps the set feeling like one system.
FINISH_DEFS = (
    # Depth comes from shadow, not from adding white: a broad white wash just
    # fogs the lighter materials. A narrow highlight plus a weighted falloff
    # into the lower-right reads as a sample lit from one side.
    '<linearGradient id="fsheen" x1="0%" y1="0%" x2="62%" y2="100%">'
    '<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.07"/>'
    '<stop offset="30%" stop-color="#FFFFFF" stop-opacity="0"/>'
    '<stop offset="100%" stop-color="#000000" stop-opacity="0.15"/>'
    "</linearGradient>"
    '<radialGradient id="fvig" cx="40%" cy="32%" r="80%">'
    '<stop offset="62%" stop-color="#000000" stop-opacity="0"/>'
    '<stop offset="100%" stop-color="#000000" stop-opacity="0.13"/>'
    "</radialGradient>"
)

FINISH = (
    f'<rect width="{W}" height="{H}" fill="url(#fsheen)"/>'
    f'<rect width="{W}" height="{H}" fill="url(#fvig)"/>'
)


def plate(name: str, defs: str, body: str) -> None:
    (OUT / f"{name}.svg").write_text(
        head(name, defs + FINISH_DEFS, body + FINISH), encoding="utf-8"
    )


# ---------------------------------------------------------------- alabaster --
def alabaster(name, warm="#F3E7D2", mid="#D9C4A2", deep="#A98C63", lit=0.55, bars=False):
    defs = (
        grad("g", warm, mid, 120)
        + bloom("b", "#FFF6E2", "42%", "34%", "78%", lit)
        + veins("v", 0.011, 130, 5)
        + grain("n", 0.85, 0.12)
    )
    strokes = "".join(
        f'<path d="M {-120 + i * 95} {H} C {60 + i * 95} {H * 0.62:.0f}, '
        f'{-40 + i * 95} {H * 0.34:.0f}, {180 + i * 95} -60" '
        f'stroke="{deep}" stroke-opacity="{0.10 + (i % 3) * 0.05:.2f}" '
        f'stroke-width="{7 + (i % 4) * 9}" fill="none"/>'
        for i in range(16)
    )
    body = (
        f'<rect width="{W}" height="{H}" fill="url(#g)"/>'
        f'<g filter="url(#v)">{strokes}</g>'
        f'<rect width="{W}" height="{H}" fill="url(#b)"/>'
    )
    if bars:
        body += "".join(
            f'<rect x="0" y="{y}" width="{W}" height="3" fill="#FFFDF6" opacity="0.5"/>'
            for y in range(90, H, 150)
        )
    body += f'<rect width="{W}" height="{H}" filter="url(#n)" opacity="0.5"/>'
    plate(name, defs, body)


alabaster("alabaster")
alabaster("alabaster-lit", "#FFF8EC", "#EBD9BC", "#B99C73", lit=0.85, bars=True)
alabaster("alabaster-edge", "#E4D2B4", "#B0916B", "#6E5537", lit=0.30)

# ------------------------------------------------------------ acrylic gloss --
def gloss(name, c1, c2, sheen="#FFFFFF", sheen_op=0.5, edge=False):
    defs = grad("g", c1, c2, 115) + bloom("b", sheen, "28%", "18%", "62%", sheen_op) + grain("n", 1.2, 0.05)
    body = (
        f'<rect width="{W}" height="{H}" fill="url(#g)"/>'
        f'<path d="M -100 {H} L {W * 0.52:.0f} -80 L {W * 0.74:.0f} -80 L {W * 0.18:.0f} {H} Z" '
        f'fill="{sheen}" opacity="0.22"/>'
        f'<path d="M {W * 0.62:.0f} {H} L {W + 160} {H * 0.1:.0f} L {W + 160} {H * 0.34:.0f} '
        f'L {W * 0.84:.0f} {H} Z" fill="{sheen}" opacity="0.13"/>'
        f'<rect width="{W}" height="{H}" fill="url(#b)"/>'
    )
    if edge:
        body += (
            f'<rect x="0" y="{H - 150}" width="{W}" height="150" fill="#000" opacity="0.30"/>'
            f'<rect x="0" y="{H - 152}" width="{W}" height="4" fill="{sheen}" opacity="0.55"/>'
        )
    body += f'<rect width="{W}" height="{H}" filter="url(#n)" opacity="0.5"/>'
    plate(name, defs, body)


gloss("acrylic-gloss", "#EFEAE2", "#8C857B")
gloss("acrylic-gloss-dark", "#2A2C31", "#0C0D0F", sheen_op=0.32)
gloss("acrylic-gloss-edge", "#DCD5CA", "#6F6960", edge=True)

# ------------------------------------------------------------------- mirror --
def mirror(name, c1="#DCE3E8", c2="#8E9AA4", tint="#FFFFFF", cut=False):
    defs = grad("g", c1, c2, 110) + bloom("b", tint, "30%", "22%", "70%", 0.5) + grain("n", 1.4, 0.04)
    bands = "".join(
        f'<rect x="{-200 + i * 210}" y="-200" width="{58 + (i % 3) * 40}" height="{H + 400}" '
        f'fill="{tint}" opacity="{0.05 + (i % 4) * 0.035:.3f}" '
        f'transform="rotate(-24 {W / 2} {H / 2})"/>'
        for i in range(11)
    )
    body = f'<rect width="{W}" height="{H}" fill="url(#g)"/>{bands}<rect width="{W}" height="{H}" fill="url(#b)"/>'
    if cut:
        body += (
            f'<circle cx="{W * 0.5:.0f}" cy="{H * 0.5:.0f}" r="250" fill="none" '
            f'stroke="#0B0B0C" stroke-opacity="0.22" stroke-width="26"/>'
            f'<circle cx="{W * 0.5:.0f}" cy="{H * 0.5:.0f}" r="250" fill="none" '
            f'stroke="{tint}" stroke-opacity="0.5" stroke-width="3"/>'
        )
    body += f'<rect width="{W}" height="{H}" filter="url(#n)" opacity="0.4"/>'
    plate(name, defs, body)


mirror("mirror", "#E4EAEF", "#69757F")
mirror("mirror-tint", "#DFCBB0", "#6E5334", "#FFE9C8")
mirror("mirror-cut", "#DCE3E9", "#5F6B76", cut=True)

# ----------------------------------------------------------------- plexi -----
def plexi(name, c1, c2, glow=None):
    defs = grad("g", c1, c2, 125) + bloom("b", glow or "#FFFFFF", "50%", "45%", "72%", 0.6 if glow else 0.4) + grain("n", 1.1, 0.05)
    sheets = "".join(
        f'<rect x="{110 + i * 60}" y="{120 + i * 30}" width="{W - 420 - i * 40}" '
        f'height="{H - 380 - i * 30}" fill="#FFFFFF" opacity="{0.08 + i * 0.05:.2f}" '
        f'stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="2"/>'
        for i in range(4)
    )
    body = f'<rect width="{W}" height="{H}" fill="url(#g)"/>{sheets}<rect width="{W}" height="{H}" fill="url(#b)"/><rect width="{W}" height="{H}" filter="url(#n)" opacity="0.4"/>'
    plate(name, defs, body)


plexi("plexi", "#E2E9ED", "#74838D")
plexi("plexi-colour", "#8FD2F0", "#0F5F86")
plexi("plexi-backlit", "#FFF7E4", "#A98E5D", glow="#FFF3D6")

# ------------------------------------------------------------ digital glass --
def digital_glass(name, c1, c2, ink, motif="arc"):
    defs = grad("g", c1, c2, 140) + bloom("b", "#FFFFFF", "34%", "26%", "66%", 0.4) + grain("n", 1.3, 0.05)
    if motif == "arc":
        art = "".join(
            f'<circle cx="{W * 0.5:.0f}" cy="{H * 1.05:.0f}" r="{120 + i * 105}" fill="none" '
            f'stroke="{ink}" stroke-opacity="{0.30 - i * 0.03:.2f}" stroke-width="{3 + (i % 2) * 6}"/>'
            for i in range(8)
        )
    elif motif == "grid":
        art = "".join(
            f'<rect x="{80 + (i % 5) * 215}" y="{70 + (i // 5) * 260}" width="170" height="210" '
            f'fill="none" stroke="{ink}" stroke-opacity="0.26" stroke-width="3"/>'
            for i in range(15)
        ) + "".join(
            f'<circle cx="{165 + (i % 5) * 215}" cy="{175 + (i // 5) * 260}" r="46" '
            f'fill="{ink}" opacity="0.16"/>'
            for i in range(15)
        )
    else:
        art = "".join(
            f'<path d="M {-100 + i * 130} {H + 60} Q {60 + i * 130} {H * 0.45:.0f} '
            f'{120 + i * 130} -60" stroke="{ink}" stroke-opacity="0.22" '
            f'stroke-width="{4 + (i % 3) * 5}" fill="none"/>'
            for i in range(12)
        )
    body = f'<rect width="{W}" height="{H}" fill="url(#g)"/>{art}<rect width="{W}" height="{H}" fill="url(#b)"/><rect width="{W}" height="{H}" filter="url(#n)" opacity="0.4"/>'
    plate(name, defs, body)


digital_glass("digital-glass", "#E2EFF2", "#6D949E", "#1E4751", "arc")
digital_glass("digital-glass-motif", "#EFE7D8", "#A08A64", "#584421", "grid")
digital_glass("digital-glass-tone", "#D7DFE4", "#5D6E7A", "#1B262D", "wave")

# --------------------------------------------------------------- wallpaper ---
def wallpaper(name, c1, c2, ink, motif="weave"):
    defs = grad("g", c1, c2, 160) + veins("v", 0.02, 26, 11) + grain("n", 0.7, 0.2)
    if motif == "weave":
        art = "".join(
            f'<rect x="0" y="{i * 26}" width="{W}" height="12" fill="{ink}" opacity="0.10"/>'
            for i in range(H // 26 + 1)
        ) + "".join(
            f'<rect x="{i * 26}" y="0" width="12" height="{H}" fill="{ink}" opacity="0.07"/>'
            for i in range(W // 26 + 1)
        )
    elif motif == "botanical":
        art = "".join(
            f'<path d="M {90 + (i % 6) * 200} {H} C {40 + (i % 6) * 200} {H * 0.6:.0f}, '
            f'{190 + (i % 6) * 200} {H * 0.5:.0f}, {120 + (i % 6) * 200} {-40 + (i // 6) * 60}" '
            f'stroke="{ink}" stroke-opacity="0.24" stroke-width="5" fill="none"/>'
            f'<ellipse cx="{120 + (i % 6) * 200}" cy="{150 + (i // 6) * 300}" rx="52" ry="26" '
            f'fill="{ink}" opacity="0.14" transform="rotate({-28 + i * 17} {120 + (i % 6) * 200} {150 + (i // 6) * 300})"/>'
            for i in range(18)
        )
    else:
        art = ""
    body = f'<rect width="{W}" height="{H}" fill="url(#g)"/><g filter="url(#v)">{art}</g><rect width="{W}" height="{H}" filter="url(#n)" opacity="0.65"/>'
    plate(name, defs, body)


wallpaper("wallpaper", "#DED5C5", "#A2947E", "#574B3C", "weave")
wallpaper("wallpaper-motif", "#E9E1D0", "#AFA28A", "#3E4A38", "botanical")
wallpaper("wallpaper-plain", "#D5CEC2", "#948D81", "#635D53", "weave")

# ------------------------------------------------------------------ wpc ------
def wpc(name, c1, c2, ink, mode="door"):
    defs = grad("g", c1, c2, 100) + veins("v", 0.008, 46, 9) + grain("n", 0.8, 0.18)
    figure = "".join(
        f'<rect x="{-60 + i * 44}" y="-80" width="{6 + (i % 4) * 5}" height="{H + 160}" '
        f'fill="{ink}" opacity="{0.06 + (i % 5) * 0.03:.2f}"/>'
        for i in range(W // 44 + 4)
    )
    body = f'<rect width="{W}" height="{H}" fill="url(#g)"/><g filter="url(#v)">{figure}</g>'
    if mode == "door":
        body += (
            f'<rect x="150" y="90" width="{W - 300}" height="{H - 180}" fill="none" '
            f'stroke="#0B0B0C" stroke-opacity="0.24" stroke-width="16"/>'
            f'<rect x="228" y="168" width="{W - 456}" height="{H - 336}" fill="none" '
            f'stroke="#0B0B0C" stroke-opacity="0.16" stroke-width="8"/>'
        )
    elif mode == "frame":
        body += (
            f'<rect x="0" y="0" width="230" height="{H}" fill="#0B0B0C" opacity="0.26"/>'
            f'<rect x="230" y="0" width="16" height="{H}" fill="#FFFFFF" opacity="0.22"/>'
            f'<rect x="{W - 180}" y="0" width="180" height="{H}" fill="#0B0B0C" opacity="0.14"/>'
        )
    body += f'<rect width="{W}" height="{H}" filter="url(#n)" opacity="0.6"/>'
    plate(name, defs, body)


wpc("wpc-door", "#A9825A", "#6B4B2E", "#3D2917", "door")
wpc("wpc-frame", "#9C7B57", "#5E432B", "#35230F", "frame")
wpc("wpc-texture", "#B08F68", "#7A5836", "#412C18", "plain")

# ---------------------------------------------------------------- pvc ply ----
def pvc(name, c1, c2, mode="face"):
    defs = grad("g", c1, c2, 105) + grain("n", 1.0, 0.13) + bloom("b", "#FFFFFF", "34%", "24%", "64%", 0.3)
    body = f'<rect width="{W}" height="{H}" fill="url(#g)"/>'
    if mode == "edge":
        body += "".join(
            f'<g><rect x="0" y="{120 + i * 150}" width="{W}" height="92" fill="#FFFFFF" opacity="0.5"/>'
            f'<rect x="0" y="{120 + i * 150}" width="{W}" height="6" fill="#0B0B0C" opacity="0.16"/>'
            f'<rect x="0" y="{206 + i * 150}" width="{W}" height="6" fill="#0B0B0C" opacity="0.10"/></g>'
            for i in range(5)
        )
    elif mode == "stack":
        body += "".join(
            f'<rect x="{60 + i * 12}" y="{620 - i * 52}" width="{W - 160}" height="44" '
            f'fill="#FFFFFF" opacity="{0.62 - i * 0.05:.2f}" stroke="#0B0B0C" stroke-opacity="0.14" stroke-width="2"/>'
            for i in range(9)
        )
    else:
        body += "".join(
            f'<rect x="0" y="{i * 7}" width="{W}" height="2" fill="#FFFFFF" opacity="0.18"/>'
            for i in range(H // 7)
        )
    body += f'<rect width="{W}" height="{H}" fill="url(#b)"/><rect width="{W}" height="{H}" filter="url(#n)" opacity="0.55"/>'
    plate(name, defs, body)


pvc("pvc-ply", "#E8E3DA", "#918B80")
pvc("pvc-ply-edge", "#DFD9CF", "#857F74", "edge")
pvc("pvc-ply-stack", "#D4CEC4", "#77726A", "stack")

# -------------------------------------------------------------------- acp ----
def acp(name, c1, c2, mode="face"):
    defs = grad("g", c1, c2, 95) + grain("n", 1.6, 0.10) + bloom("b", "#FFFFFF", "26%", "18%", "60%", 0.28)
    brushed = "".join(
        f'<rect x="0" y="{i * 4}" width="{W}" height="1.6" fill="#FFFFFF" '
        f'opacity="{0.05 + (i % 7) * 0.02:.2f}"/>'
        for i in range(H // 4)
    )
    body = f'<rect width="{W}" height="{H}" fill="url(#g)"/>{brushed}'
    if mode == "facade":
        body += "".join(
            f'<rect x="{40 + (i % 4) * 285}" y="{40 + (i // 4) * 285}" width="265" height="265" '
            f'fill="none" stroke="#0B0B0C" stroke-opacity="0.30" stroke-width="5"/>'
            for i in range(12)
        )
    elif mode == "interior":
        body += "".join(
            f'<rect x="0" y="{i * 120}" width="{W}" height="112" fill="#FFFFFF" opacity="0.06" '
            f'stroke="#0B0B0C" stroke-opacity="0.18" stroke-width="3"/>'
            for i in range(8)
        )
    body += f'<rect width="{W}" height="{H}" fill="url(#b)"/><rect width="{W}" height="{H}" filter="url(#n)" opacity="0.5"/>'
    plate(name, defs, body)


acp("acp", "#C4C9CF", "#4E545C")
acp("acp-facade", "#A6ADB5", "#343A42", "facade")
acp("acp-interior", "#D3D8DD", "#6F767E", "interior")

# -------------------------------------------------------------------- cnc ----
def cnc(name, c1, c2, ink, mode="jaali"):
    defs = grad("g", c1, c2, 130) + bloom("b", "#FFFFFF", "40%", "30%", "70%", 0.35) + grain("n", 1.0, 0.09)
    body = f'<rect width="{W}" height="{H}" fill="url(#g)"/>'
    if mode == "jaali":
        cells = []
        for r in range(6):
            for c in range(8):
                cx, cy = 90 + c * 150, 90 + r * 150
                cells.append(
                    f'<path d="M {cx} {cy - 58} L {cx + 58} {cy} L {cx} {cy + 58} L {cx - 58} {cy} Z" '
                    f'fill="{ink}" opacity="0.30"/>'
                    f'<circle cx="{cx}" cy="{cy}" r="20" fill="{c1}" opacity="0.9"/>'
                )
        body += "".join(cells)
    elif mode == "detail":
        body += (
            f'<path d="M 120 {H} L 120 260 A 180 180 0 0 1 480 260 L 480 {H} Z" fill="{ink}" opacity="0.28"/>'
            f'<path d="M 660 {H} L 660 200 L 1080 200 L 1080 {H} Z" fill="{ink}" opacity="0.18"/>'
            f'<path d="M 120 {H} L 120 260 A 180 180 0 0 1 480 260 L 480 {H}" fill="none" '
            f'stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="4"/>'
        )
    else:
        body += "".join(
            f'<rect x="{60 + (i % 7) * 160}" y="{60 + (i // 7) * 160}" width="120" height="120" '
            f'fill="{ink}" opacity="0.26" rx="{(i % 3) * 22}"/>'
            for i in range(35)
        )
    body += f'<rect width="{W}" height="{H}" fill="url(#b)"/><rect width="{W}" height="{H}" filter="url(#n)" opacity="0.45"/>'
    plate(name, defs, body)


cnc("cnc", "#E3DED3", "#968E80", "#22242A")
cnc("cnc-detail", "#D6DCE1", "#6E7780", "#111316", "detail")
cnc("cnc-screen", "#E7E0D3", "#9C927F", "#2B2D32", "screen")

# ------------------------------------------------------------ editorial ------
def editorial(name, c1, c2, accent, mode="hero"):
    defs = grad("g", c1, c2, 118) + bloom("b", accent, "62%", "26%", "78%", 0.30) + grain("n", 0.8, 0.14)
    if mode == "hero":
        art = (
            f'<rect x="{W * 0.52:.0f}" y="0" width="{W * 0.48:.0f}" height="{H}" fill="#FFFFFF" opacity="0.06"/>'
            f'<rect x="0" y="{H * 0.66:.0f}" width="{W}" height="{H * 0.34:.0f}" fill="#0B0B0C" opacity="0.16"/>'
            + "".join(
                f'<rect x="{W * 0.56 + i * 92:.0f}" y="{120 + i * 34}" width="60" '
                f'height="{H - 260 - i * 68}" fill="#FFFFFF" opacity="{0.10 + i * 0.04:.2f}"/>'
                for i in range(5)
            )
            + f'<circle cx="{W * 0.3:.0f}" cy="{H * 0.34:.0f}" r="210" fill="none" '
            f'stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="2"/>'
        )
    elif mode == "showroom":
        art = "".join(
            f'<rect x="{i * 150}" y="{60 + (i % 3) * 40}" width="126" height="{H - 160 - (i % 3) * 80}" '
            f'fill="#FFFFFF" opacity="{0.07 + (i % 4) * 0.045:.2f}" stroke="#FFFFFF" '
            f'stroke-opacity="0.18" stroke-width="2"/>'
            for i in range(8)
        ) + f'<rect x="0" y="{H - 120}" width="{W}" height="120" fill="#0B0B0C" opacity="0.22"/>'
    else:
        art = "".join(
            f'<rect x="{70 + (i % 4) * 280}" y="{70 + (i // 4) * 280}" width="240" height="240" '
            f'fill="#FFFFFF" opacity="{0.05 + (i % 5) * 0.04:.2f}" stroke="#FFFFFF" '
            f'stroke-opacity="0.2" stroke-width="2"/>'
            for i in range(12)
        )
    body = f'<rect width="{W}" height="{H}" fill="url(#g)"/>{art}<rect width="{W}" height="{H}" fill="url(#b)"/><rect width="{W}" height="{H}" filter="url(#n)" opacity="0.6"/>'
    plate(name, defs, body)


editorial("hero", "#1A1C20", "#08090A", "#009FE3", "hero")
editorial("showroom", "#2A2622", "#0C0B0A", "#C9B18A", "showroom")
editorial("materials-lab", "#26282C", "#0B0C0D", "#009FE3", "grid")

print(f"{len(list(OUT.glob('*.svg')))} plates written to {OUT}")
