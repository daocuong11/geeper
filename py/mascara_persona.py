#!/usr/bin/env python3
"""Máscara de la persona en cada cuadro de un video («Cambiar la persona», src/lib/rehacer.ts).

Uso (con el Python de Wan2GP y la carpeta de Wan2GP como cwd):
  <python de Wan2GP> -I py/mascara_persona.py <dir Wan2GP> <video.mp4> <mascara.mp4> <ffmpeg> [palabra]
-> JSON por stdout: {"cuadros": N, "cobertura": fracción de cuadros con persona, "area": área media}

Usa SAM 3.1 de Meta (SAM License: uso comercial permitido, sin regalías) a través del código de
Wan2GP (preprocessing/sam3, el mismo «Magic Mask» de su interfaz), con la palabra «person». Salida:
blanco = persona, negro = el resto, mismos cuadros y fps que el video.
"""
import json
import subprocess
import sys


def main():
    wan, entrada, salida, ffmpeg = sys.argv[1:5]
    palabra = sys.argv[5] if len(sys.argv) > 5 else "person"
    sys.path.insert(0, wan)
    import cv2
    import numpy as np
    from preprocessing.sam3.preprocessor import run_sam3_video

    cap = cv2.VideoCapture(entrada)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    cuadros = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        cuadros.append(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
    cap.release()
    if not cuadros:
        raise SystemExit("El video no tiene cuadros")
    video = np.stack(cuadros)
    mascara = run_sam3_video(video, [palabra], fill_hole_area=64)
    t, h, w = mascara.shape[:3]
    p = subprocess.Popen(
        [ffmpeg, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
         "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", salida],
        stdin=subprocess.PIPE,
    )
    for i in range(t):
        p.stdin.write((mascara[i].astype(np.uint8) * 255).tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise SystemExit("ffmpeg no pudo escribir la máscara")
    por_cuadro = mascara.reshape(t, -1).mean(axis=1)
    print(json.dumps({"cuadros": int(t), "cobertura": float((por_cuadro > 0.002).mean()), "area": float(por_cuadro.mean())}))


if __name__ == "__main__":
    main()
