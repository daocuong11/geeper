#!/usr/bin/env python3
"""Puente de Geeper hacia la lógica de mpt_acabado.py (se importa, no se copia).

Uso: python3 py/geeper_py.py <accion>   con JSON por stdin; responde JSON por stdout.
  alinear    {"guion": str, "palabras": [{text,start,end}]}  -> [{text,start,end}]
  reemplazos {"palabras": [...], "pares": ["GTA seis=GTA VI"]} -> [...]
  agrupar    {"palabras": [...]}                               -> [[...], ...]
"""
import json
import os
import sys
from pathlib import Path

BIN = Path(os.environ.get("GEEPER_ESTUDIO_BIN", Path.home() / "dev" / "video-tools" / "bin"))
sys.path.insert(0, str(BIN))
import mpt_acabado  # noqa: E402


def main() -> int:
    accion = sys.argv[1]
    datos = json.load(sys.stdin)
    if accion == "alinear":
        res = mpt_acabado.alinear(datos["guion"], datos["palabras"])
    elif accion == "reemplazos":
        res = mpt_acabado.reemplazos(datos["palabras"], datos["pares"])
    elif accion == "agrupar":
        res = mpt_acabado.agrupar(datos["palabras"])
    else:
        print(f"acción desconocida: {accion}", file=sys.stderr)
        return 2
    json.dump(res, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
