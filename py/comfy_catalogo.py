"""Catálogo de workflows de ComfyUI para Geeper (src/lib/comfyui.ts).

Lo corre el Python de ComfyUI: usa el paquete `comfyui-workflow-templates` que viene con su versión
(el mismo que lee el editor de ComfyUI) y escribe en stdout un JSON con el índice de plantillas
(`index.json`) y la ruta absoluta de cada archivo (workflow, miniaturas, entradas de ejemplo).
"""
import json
import sys


def main() -> int:
    try:
        from comfyui_workflow_templates import get_asset_path, iter_templates
    except ImportError as e:
        print(json.dumps({"error": f"falta comfyui-workflow-templates: {e}"}))
        return 1
    archivos = {}
    for entrada in iter_templates():
        for asset in entrada.assets:
            try:
                archivos[asset.filename] = get_asset_path(entrada.template_id, asset.filename)
            except FileNotFoundError:
                continue
    indice = None
    ruta = archivos.get("index.json")
    if ruta:
        with open(ruta, encoding="utf-8") as f:
            indice = json.load(f)
    else:
        # Versiones viejas: el índice va en la carpeta de plantillas del paquete principal.
        try:
            import importlib.resources

            import comfyui_workflow_templates

            p = importlib.resources.files(comfyui_workflow_templates) / "templates" / "index.json"
            indice = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"error": f"no encontré index.json: {e}"}))
            return 1
    json.dump({"indice": indice, "archivos": archivos}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
