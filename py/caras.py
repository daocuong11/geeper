#!/usr/bin/env python3
"""Dónde está la cara en cada imagen o video (BRECHAS.md E4: reencuadre automático).

Uso: <python con opencv> -I py/caras.py   con JSON por stdin; responde JSON por stdout.
  {"modelo": "<ruta a face_detection_yunet_2023mar.onnx>",
   "archivos": [{"id": "clip-01", "ruta": "/abs/clip.mp4", "tipo": "video"}, ...],
   "puntaje": 0.8, "muestras": 40}
  -> {"clip-01": {"x", "y", "ancho", "confianza", "cobertura", "dispersion", "muestras"} | null, ...}

x, y: centro de la cara principal en fracción del cuadro (0..1); ancho: ancho de la cara en fracción del
ancho del cuadro; cobertura: fracción de las muestras con cara; dispersion: cuánto se mueve el centro
(percentil 90 de |x − mediana|, en fracción del ancho). null si no hay cara en suficientes muestras.

Detector: YuNet 2023mar de OpenCV Zoo (MIT, 232 KB), el mismo que usa LightCraft
(storytold/lightcraft crates/faces/src/known.rs). Cara principal = la de mayor área × puntaje; el
centro se suaviza con una media móvil exponencial (0,3) y se resume con la mediana (HEREDADO.md, facecam).
"""
import json
import sys

import cv2

LADO = 640  # YuNet se entrenó a 640; achicar antes acelera y no pierde caras de tamaño útil
EMA = 0.3
COBERTURA_MIN = 0.25
ANCHO_MIN = 0.025  # caras de menos del 2,5 % del ancho: ruido o fondo


def mediana(v):
    s = sorted(v)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def cuadros(ruta, tipo, maximo):
    """Fotogramas a analizar: la imagen, o hasta `maximo` repartidos en todo el video."""
    if tipo == "imagen":
        img = cv2.imread(ruta, cv2.IMREAD_COLOR)
        if img is not None:
            yield img
        return
    cap = cv2.VideoCapture(ruta)
    try:
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        cada = max(1, total // maximo) if total > 0 else 15
        if cada > 60:  # video largo: saltar a cada muestra en vez de decodificar todo
            for j in range(maximo):
                cap.set(cv2.CAP_PROP_POS_FRAMES, j * cada)
                ok, img = cap.read()
                if ok and img is not None:
                    yield img
            return
        i = 0
        while True:
            ok = cap.grab()
            if not ok:
                break
            if i % cada == 0:
                ok, img = cap.retrieve()
                if ok and img is not None:
                    yield img
            i += 1
    finally:
        cap.release()


def analizar(detector, ruta, tipo, maximo):
    centros, anchos, puntajes = [], [], []
    muestras = 0
    suave = None
    for img in cuadros(ruta, tipo, maximo):
        h, w = img.shape[:2]
        k = min(1.0, LADO / max(w, h))
        if k < 1:
            img = cv2.resize(img, (max(1, round(w * k)), max(1, round(h * k))), interpolation=cv2.INTER_AREA)
            h, w = img.shape[:2]
        muestras += 1
        detector.setInputSize((w, h))
        _, caras = detector.detect(img)
        if caras is None or len(caras) == 0:
            suave = None  # sin cara (corte u oclusión): al volver, no arrastrar la posición vieja
            continue
        mejor = max(caras, key=lambda f: float(f[2]) * float(f[3]) * float(f[14]))
        fx, fy, fw, fh, puntaje = (float(mejor[i]) for i in (0, 1, 2, 3, 14))
        if fw / w < ANCHO_MIN:
            continue
        c = ((fx + fw / 2) / w, (fy + fh / 2) / h)
        suave = c if suave is None else (suave[0] + EMA * (c[0] - suave[0]), suave[1] + EMA * (c[1] - suave[1]))
        centros.append(suave)
        anchos.append(fw / w)
        puntajes.append(puntaje)
    if muestras == 0 or len(centros) / muestras < COBERTURA_MIN:
        return None
    x = mediana([c[0] for c in centros])
    y = mediana([c[1] for c in centros])
    desvios = sorted(abs(c[0] - x) for c in centros)
    p90 = desvios[min(len(desvios) - 1, int(0.9 * len(desvios)))]
    clamp = lambda v: max(0.0, min(1.0, v))  # noqa: E731
    return {
        "x": round(clamp(x), 4),
        "y": round(clamp(y), 4),
        "ancho": round(clamp(mediana(anchos)), 4),
        "confianza": round(clamp(sum(puntajes) / len(puntajes)), 4),
        "cobertura": round(len(centros) / muestras, 4),
        "dispersion": round(p90, 4),
        "muestras": muestras,
    }


def main() -> int:
    datos = json.load(sys.stdin)
    puntaje = float(datos.get("puntaje", 0.8))
    maximo = max(1, int(datos.get("muestras", 40)))
    detector = cv2.FaceDetectorYN.create(datos["modelo"], "", (LADO, LADO), puntaje, 0.3, 50)
    res = {}
    for a in datos["archivos"]:
        try:
            res[a["id"]] = analizar(detector, a["ruta"], a["tipo"], maximo)
        except cv2.error as e:  # un archivo dañado no tumba el lote
            print(f"{a['id']}: {e}", file=sys.stderr)
            res[a["id"]] = None
    json.dump(res, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
