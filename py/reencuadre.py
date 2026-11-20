#!/usr/bin/env python3
"""Reencuadre de un tramo 16:9 a 9:16 para Geeper (BRECHAS.md E4), con OpenCV + YuNet.

Uso: python -I py/reencuadre.py   con JSON por stdin; responde JSON por stdout.
  {"op": "ping"}  -> {"ok": true, "version": 1, "modelo": "<sha256>"}
  {"op": "reencuadre", "video": "<tramo.mp4>", "layout": "react" | "cara"}
      -> {"ok": true, "filtro": "<filter_complex de [0:v] a [v]>", "params": {...}, "resumen": "..."}
      -> {"ok": false, "motivo": "..."}   (quien llama decide el plan B: cubrir o contener)

  react: la cara del streamer arriba (1080×730) y el juego abajo (1080×1190); el juego se corre para no
         mostrar contadores, alertas ni la propia cámara (overlays estáticos).
  cara:  un recorte 9:16 a toda la altura que sigue la cara (directos IRL, cámara a pantalla completa).

El filtro se aplica al tramo entero (t = 0 es el inicio del tramo). `params` guarda todo lo necesario
para reproducir el mismo recorte sin volver a correr la detección.

La lógica del layout react y de `game_offset` viene de Bodila51/gtavi-claudecode `scripts/cut.py`
(MIT, commit dd95d39; ver py/LICENCIAS-TERCEROS.md).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

VERSION = 1
W, H = 1080, 1920
TOP = 730  # alto del panel de la cara en react (la costura)
GAME_H = H - TOP


def even(n):
    return int(n) // 2 * 2


def tamano(video):
    import cv2
    cap = cv2.VideoCapture(str(video))
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    n, fps = cap.get(cv2.CAP_PROP_FRAME_COUNT), cap.get(cv2.CAP_PROP_FPS) or 30
    cap.release()
    return w, h, (n / fps if n > 0 else 0)


def game_offset(video, s0, e0, src, cam_box):
    """Offset x del recorte de 1080 de ancho del juego que evita overlays estáticos y la cámara."""
    import cv2
    import numpy as np
    sw, sh = src
    gw = even(sw * GAME_H / sh)
    if gw <= W:
        return 0
    cap = cv2.VideoCapture(str(video))
    frames = []
    for k in range(12):
        cap.set(cv2.CAP_PROP_POS_MSEC, (s0 + (e0 - s0) * (k + 0.5) / 12) * 1000)
        ok, f = cap.read()
        if ok:
            frames.append(cv2.resize(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), (gw, GAME_H)).astype(np.float32))
    cap.release()
    if len(frames) < 4:
        return (gw - W) // 2
    st = np.stack(frames)
    std = st.std(0)
    med = np.median(st, 0)
    edges = cv2.Canny(med.astype(np.uint8), 60, 160) > 0
    bad = (std < 6) & cv2.dilate(edges.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    x, y, w, h = cam_box
    bad[int(y * GAME_H):int((y + h) * GAME_H), int(x * gw):int((x + w) * gw)] = True
    col = bad.sum(0).astype(np.float64)
    cs = np.concatenate([[0], np.cumsum(col)])
    camcols = np.zeros(gw)
    camcols[int(x * gw):int((x + w) * gw)] = 1
    cc = np.concatenate([[0], np.cumsum(camcols)])
    best, bx = None, (gw - W) // 2
    for ox in range(0, gw - W + 1, 8):
        # nunca mostrar la cámara dos veces; si no, cerca del centro (subtítulos y acción del juego)
        if cc[ox + W] - cc[ox] > 0 and (cc[-1] < gw - W):
            continue
        cost = (cs[ox + W] - cs[ox]) * 0.2 + abs(ox - (gw - W) / 2) * GAME_H * 0.05
        if best is None or cost < best:
            best, bx = cost, ox
    return int(bx)


def react(video):
    import facecam
    sw, sh, dur = tamano(video)
    if not sw or not dur:
        return {"ok": False, "motivo": "no pude leer el tramo"}
    r = facecam.find_cam(video, 0, dur)
    if r.get("mode") not in ("cam", "face"):
        return {"ok": False, "motivo": f"no hay una cara de streamer estable sobre el juego ({r.get('reason', '')})", "deteccion": r}
    if not facecam.has_gameplay(video, 0, dur, r["box"]):
        return {"ok": False, "motivo": "fuera de la cámara no hay juego (misma escena o pantalla sin juego)", "deteccion": r}
    params = {"layout": "react", "version": VERSION, "modelo": facecam.MODEL_SHA256, "fuente": [sw, sh],
              "modo": r["mode"], "confianza": r.get("confidence"), "caja": r["box"], "cara": r.get("face")}
    if r["mode"] == "face" and r.get("face_track"):
        bnd = facecam.inner_edges(video, 0, dur, r["face"], sw, sh)
        fe = facecam.face_crop_expr(r["face_track"], sw, sh, W, TOP, bounds=bnd)
        top = f"crop={fe['w']}:{fe['h']}:{fe['x']}:{fe['y']}"
        params.update({"bordes": list(bnd), "seguimiento": r["face_track"], "recorteCara": fe})
    else:
        bx = list(r["box"])
        if r["mode"] == "face":  # sin marco: ampliar para no quedar en un primer plano borroso
            cx, cy = bx[0] + bx[2] / 2, bx[1] + bx[3] / 2
            bw, bh = min(1.0, bx[2] * 2.6), min(1.0, bx[3] * 2.2)
            bx = [min(max(0.0, cx - bw / 2), 1 - bw), min(max(0.0, cy - bh / 2), 1 - bh), bw, bh]
        x, y, w, h = bx
        top = f"crop={even(sw * w)}:{even(sh * h)}:{even(sw * x)}:{even(sh * y)}"
        params["cajaUsada"] = bx
    gw = even(sw * GAME_H / sh) if sw * GAME_H / sh >= W else W
    gx = game_offset(video, 0, dur, (sw, sh), r["box"])
    params["juego"] = {"ancho": gw, "x": gx}
    filtro = (f"[0:v]split[a][b];[a]{top},scale={W}:{TOP}:force_original_aspect_ratio=increase,crop={W}:{TOP},setsar=1[cam];"
              f"[b]scale={gw}:{GAME_H},crop={W}:{GAME_H}:{even(gx)}:0,setsar=1[game];[cam][game]vstack[v]")
    return {"ok": True, "filtro": filtro, "params": params, "costura": TOP / H,
            "resumen": f"react: {r.get('summary', r['mode'])}, confianza {r.get('confidence')}"}


def cara(video):
    import facecam
    sw, sh, dur = tamano(video)
    if not sw or not dur:
        return {"ok": False, "motivo": "no pude leer el tramo"}
    r = facecam.find_cam(video, 0, dur)
    track = r.get("face_track") or []
    if not track:
        if r.get("mode") == "cam":
            return {"ok": False, "motivo": "la cara está en una webcam sobre el juego: usa el layout react", "deteccion": r}
        return {"ok": False, "motivo": f"no hay una cara estable que seguir ({r.get('reason', '')})", "deteccion": r}
    # head_fill mínimo: el recorte usa toda la altura y sólo se mueve en x siguiendo la cara.
    fe = facecam.face_crop_expr(track, sw, sh, W, H, head_fill=0.01)
    filtro = f"[0:v]crop={fe['w']}:{fe['h']}:{fe['x']}:{fe['y']},scale={W}:{H},setsar=1[v]"
    params = {"layout": "cara", "version": VERSION, "modelo": facecam.MODEL_SHA256, "fuente": [sw, sh],
              "modo": r.get("mode"), "confianza": r.get("confidence"), "cara": r.get("face"), "seguimiento": track, "recorte": fe}
    return {"ok": True, "filtro": filtro, "params": params, "resumen": f"cara: siguiendo {len(track)} puntos"}


def main() -> int:
    datos = json.load(sys.stdin)
    op = datos.get("op")
    try:
        if op == "ping":
            import facecam
            facecam.model_path()
            res = {"ok": True, "version": VERSION, "modelo": facecam.MODEL_SHA256}
        elif op == "reencuadre":
            fn = {"react": react, "cara": cara}.get(datos.get("layout"))
            if not fn:
                print(f"layout desconocido: {datos.get('layout')}", file=sys.stderr)
                return 2
            res = fn(datos["video"])
        else:
            print(f"op desconocida: {op}", file=sys.stderr)
            return 2
    except RuntimeError as e:
        res = {"ok": False, "motivo": str(e)}
    json.dump(res, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
