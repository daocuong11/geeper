"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, postJson, useSondeo } from "./comun";

interface Plantilla {
  slug: string;
  nombre: string;
  datos: { descripcion: string };
}

export function FormNuevo() {
  const router = useRouter();
  const { datos } = useSondeo<{ plantillas: Plantilla[] }>("/api/plantillas", 60_000);
  const [temas, setTemas] = useState("");
  const [formato, setFormato] = useState("9:16");
  const [plantilla, setPlantilla] = useState("gta-vi-shorts");
  const [mptTaskId, setMpt] = useState("");
  const [aceptoGpu, setAcepto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lista = temas.split("\n").map((t) => t.trim()).filter(Boolean);
  const importa = mptTaskId.trim().length > 0;
  const necesitaGpu = !importa;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await postJson<{ proyectos: { id: string }[] }>("/api/proyectos", { temas, formato, plantilla, mptTaskId: mptTaskId || undefined });
      router.push(r.proyectos.length === 1 ? `/proyectos/${r.proyectos[0]!.id}` : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-semibold">Nuevo proyecto o lote</h1>
      <div>
        <label className="etiqueta" htmlFor="temas">Tema (uno por línea: varias líneas crean un lote)</label>
        <textarea id="temas" className="campo min-h-36 font-mono" value={temas} onChange={(e) => setTemas(e.target.value)}
          placeholder={"Por qué los faros siguen siendo importantes\nFaros que se convirtieron en hoteles"} required />
        <p className="mt-1 text-xs text-tenue">{lista.length === 0 ? "Sin temas todavía" : lista.length === 1 ? "1 proyecto" : `Lote de ${lista.length} proyectos (si se corta, se retoma sin repetir los terminados)`}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="etiqueta">Formato</legend>
          <div className="flex gap-2">
            {["9:16", "16:9", "1:1"].map((f) => (
              <label key={f} className={`boton cursor-pointer ${formato === f ? "boton-primario" : ""}`}>
                <input type="radio" name="formato" value={f} checked={formato === f} onChange={() => setFormato(f)} className="sr-only" />
                {f}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="etiqueta" htmlFor="plantilla">Plantilla de canal</label>
          <select id="plantilla" className="campo" value={plantilla} onChange={(e) => setPlantilla(e.target.value)}>
            {datos?.plantillas.map((p) => <option key={p.slug} value={p.slug}>{p.nombre}</option>)}
          </select>
          <p className="mt-1 text-xs text-tenue">{datos?.plantillas.find((p) => p.slug === plantilla)?.datos.descripcion}</p>
        </div>
      </div>
      <details className="tarjeta p-3">
        <summary className="cursor-pointer text-sm">Importar un short que MPT ya generó (sin usar la GPU)</summary>
        <label className="etiqueta mt-3" htmlFor="mpt">task_id de MoneyPrinterTurbo</label>
        <input id="mpt" className="campo font-mono" value={mptTaskId} onChange={(e) => setMpt(e.target.value)} placeholder="c721927b-353e-4dce-9bbb-8ce7d33ed5f2" />
        <p className="mt-1 text-xs text-tenue">Usa la primera línea de «Tema» como nombre.</p>
      </details>
      {necesitaGpu && (
        <Aviso tipo="alerta">
          <p className="font-medium">Generar usa la GPU (guion, imágenes y voz con MPT, unos 3 min por tema).</p>
          <p className="mt-1">Windows se ha reiniciado sin aviso durante generaciones: guarda tu trabajo antes. Si se reinicia, el trabajo queda «interrumpido» y lo relanzas tú desde Trabajos; nunca se reintenta solo.</p>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" checked={aceptoGpu} onChange={(e) => setAcepto(e.target.checked)} />
            Guardé mi trabajo; puedo generar.
          </label>
        </Aviso>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className="boton boton-primario" disabled={enviando || lista.length === 0 || (necesitaGpu && !aceptoGpu)}>
        {enviando ? "Creando…" : importa ? "Importar" : lista.length > 1 ? `Crear lote de ${lista.length}` : "Crear y generar"}
      </button>
    </form>
  );
}
