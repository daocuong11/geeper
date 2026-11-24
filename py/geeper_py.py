#!/usr/bin/env python3
"""Puente de Geeper hacia la alineación guion ↔ whisper (py/alineacion.py, copia de mpt_acabado.py).

Uso: python py/geeper_py.py alinear   con JSON por stdin; responde JSON por stdout.
  alinear    {"guion": str, "palabras": [{text,start,end}]}  -> [{text,start,end}]
(reemplazos y agrupar ya están en TypeScript: src/lib/subtitulos.ts.)
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import alineacion  # noqa: E402


def main() -> int:
    accion = sys.argv[1]
    datos = json.load(sys.stdin)
    if accion == "alinear":
        res = alineacion.alinear(datos["guion"], datos["palabras"])
    else:
        print(f"acción desconocida: {accion}", file=sys.stderr)
        return 2
    json.dump(res, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
