"""Alineación guion ↔ whisper de Geeper: copia de norm() y alinear() de mpt_acabado.py del estudio
(~/dev/video-tools/bin), sólo con la biblioteca estándar, para que la app de escritorio no dependa del
estudio. tests/alineacion.test.ts comprueba que dé lo mismo que el original cuando el estudio está.
"""
from __future__ import annotations

import difflib
import re
import unicodedata


def norm(token: str) -> str:
    t = unicodedata.normalize("NFKD", token.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", t)


def alinear(guion: str, palabras_w: list[dict]) -> list[dict]:
    """Devuelve las palabras del guion con start/end tomados de whisper."""
    s_tok = guion.split()
    s_n = [norm(t) for t in s_tok]
    w_n = [norm(w["text"]) for w in palabras_w]
    res: list[dict | None] = [None] * len(s_tok)
    sm = difflib.SequenceMatcher(a=s_n, b=w_n, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            for k in range(i2 - i1):
                w = palabras_w[j1 + k]
                res[i1 + k] = {"text": s_tok[i1 + k], "start": w["start"], "end": w["end"]}
        elif op == "replace":
            ini, fin = palabras_w[j1]["start"], palabras_w[j2 - 1]["end"]
            pesos = [max(1, len(s_n[i])) for i in range(i1, i2)]
            total, t = sum(pesos), ini
            for k, i in enumerate(range(i1, i2)):
                d = (fin - ini) * pesos[k] / total
                res[i] = {"text": s_tok[i], "start": t, "end": t + d}
                t += d
        # insert (palabras del guion que whisper no oyó) se interpolan abajo; delete se ignora.
    # Interpolar huecos entre vecinos conocidos.
    i = 0
    while i < len(res):
        if res[i] is not None:
            i += 1
            continue
        j = i
        while j < len(res) and res[j] is None:
            j += 1
        ini = res[i - 1]["end"] if i > 0 else 0.0
        fin = res[j]["start"] if j < len(res) else ini + 0.35 * (j - i)
        paso = max(0.05, (fin - ini) / (j - i))
        for k in range(i, j):
            res[k] = {"text": s_tok[k], "start": ini + paso * (k - i), "end": ini + paso * (k - i + 1)}
        i = j
    return [r for r in res if r is not None]
