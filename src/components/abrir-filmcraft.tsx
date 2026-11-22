"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pedir } from "./comun";

interface Manifiesto { nombre: string; base: string; otio: string; srt: string | null; medios: { nombre: string; bytes: number; existe: boolean }[] }
interface EstadoApp { instalada: string | null; instalacion?: { fase?: string; detalle?: string } | null }

const MAX = 512 * 1024 * 1024;
const MB = (b: number) => `${Math.round(b / 1048576)} MB`;
const EN_CURSO = ["descargando", "verificando", "descomprimiendo"];

/**
 * «Abrir en FilmCraft»: FilmCraft (la de Media) a pantalla completa con el proyecto ya cargado. Le manda
 * cada medio y después la línea de tiempo y los subtítulos (filmcraft-host.ts); lo que guarda o exporta
 * queda en la carpeta del proyecto. Si FilmCraft no está, la instala aquí mismo.
 */
export function AbrirEnFilmcraft({ proyectoId }: { proyectoId: string }) {
  const marco = useRef<HTMLIFrameElement>(null);
  const [app, setApp] = useState<EstadoApp | null>(null);
  const [estado, setEstado] = useState("Preparando…");
  const [avisos, setAvisos] = useState<string[]>([]);
  const [guardados, setGuardados] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sucio = useRef(false);
  const enviado = useRef(false);

  const revisar = useCallback(() => pedir<EstadoApp>("/api/media/filmcraft").then(setApp, (e: Error) => setError(e.message)), []);
  useEffect(() => void revisar(), [revisar]);
  // Mientras se instala, se revisa cada 3 s.
  useEffect(() => {
    if (!app || app.instalada || !EN_CURSO.includes(app.instalacion?.fase ?? "")) return;
    const t = setTimeout(() => void revisar(), 3000);
    return () => clearTimeout(t);
  }, [app, revisar]);

  useEffect(() => {
    const salir = (e: BeforeUnloadEvent) => { if (sucio.current) e.preventDefault(); };
    addEventListener("beforeunload", salir);
    return () => removeEventListener("beforeunload", salir);
  }, []);

  useEffect(() => {
    if (!app?.instalada) return;
    const mandar = (name: string, bytes: ArrayBuffer) =>
      marco.current?.contentWindow?.postMessage({ type: "filmcraft:open", name, bytes }, location.origin, [bytes]);

    async function cargar() {
      const m = await pedir<Manifiesto>(`/api/proyectos/${proyectoId}/filmcraft`);
      const faltan: string[] = [];
      const lista = m.medios.filter((x) => {
        if (!x.existe) faltan.push(`Falta en la carpeta del proyecto: ${x.nombre}`);
        else if (x.bytes > MAX) faltan.push(`${x.nombre} pesa ${MB(x.bytes)} y FilmCraft abre hasta 512 MB por archivo: agrégalo a mano.`);
        return x.existe && x.bytes <= MAX;
      });
      for (const [i, x] of lista.entries()) {
        setEstado(`Mandando a FilmCraft ${i + 1} de ${lista.length}: ${x.nombre}`);
        const r = await fetch(`/api/proyectos/${proyectoId}/filmcraft/archivo?nombre=${encodeURIComponent(x.nombre)}`);
        if (!r.ok) { faltan.push(`No se pudo leer ${x.nombre}`); continue; }
        mandar(x.nombre, await r.arrayBuffer());
      }
      // La línea de tiempo va después de los medios: FilmCraft enlaza cada clip con el archivo de su nombre.
      mandar(`${m.base}.otio`, new TextEncoder().encode(m.otio).buffer as ArrayBuffer);
      if (m.srt) mandar(`${m.base}.srt`, new TextEncoder().encode(m.srt).buffer as ArrayBuffer);
      setAvisos(faltan);
      setEstado(`«${m.nombre}» está abierto en FilmCraft. Lo que guardes o exportes queda en la carpeta del proyecto (editor/).`);
    }

    async function alMensaje(e: MessageEvent) {
      if (e.origin !== location.origin || e.source !== marco.current?.contentWindow) return;
      const d = (e.data ?? {}) as { type?: string; name?: string; bytes?: ArrayBuffer; dirty?: boolean; error?: string };
      if (d.type === "filmcraft:ready" && !enviado.current) {
        enviado.current = true;
        cargar().catch((x: Error) => setError(`No se pudo abrir el proyecto en FilmCraft: ${x.message}`));
      } else if (d.type === "filmcraft:dirty") {
        sucio.current = Boolean(d.dirty);
      } else if (d.type === "filmcraft:failed") {
        setError(`FilmCraft no pudo arrancar: ${d.error ?? "error desconocido"}`);
      } else if (d.type === "filmcraft:save" && d.name && d.bytes) {
        setEstado(`Guardando ${d.name}…`);
        try {
          const r = await pedir<{ ruta: string }>(`/api/proyectos/${proyectoId}/filmcraft?nombre=${encodeURIComponent(d.name)}`, { method: "POST", body: d.bytes });
          setGuardados((g) => [...g.filter((x) => x !== r.ruta), r.ruta]);
          setEstado(`Guardado: ${r.ruta}`);
        } catch (x) {
          setError(`No se pudo guardar ${d.name}: ${(x as Error).message}`);
        }
      }
    }
    addEventListener("message", alMensaje);
    return () => removeEventListener("message", alMensaje);
  }, [app?.instalada, proyectoId]);

  const instalar = () => {
    setError(null);
    pedir("/api/media/filmcraft", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(revisar, (e: Error) => setError(e.message));
  };
  const instalando = Boolean(app && !app.instalada && EN_CURSO.includes(app.instalacion?.fase ?? ""));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1b1b1b]">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-3 border-b border-borde bg-[#0f131a] px-3 py-1 text-sm">
        <Link href={`/proyectos/${proyectoId}`} className="text-tenue hover:text-white" onClick={(e) => {
          if (sucio.current && !confirm("Hay cambios sin guardar en FilmCraft. ¿Salir igual?")) e.preventDefault();
        }}>← Volver al proyecto</Link>
        <span className="font-medium">FilmCraft</span>
        <span className="text-xs text-tenue" role="status">{error ?? estado}</span>
        {guardados.length > 0 && <span className="ml-auto text-xs text-emerald-300">Guardado en la carpeta del proyecto: {guardados.map((g) => g.split("/").pop()).join(", ")}</span>}
      </div>
      {avisos.length > 0 && (
        <div className="shrink-0 border-b border-amber-800 bg-amber-950/60 px-3 py-1 text-xs">{avisos.join(" · ")}</div>
      )}
      {error && !app?.instalada ? (
        <div className="m-auto max-w-md p-6 text-center text-sm text-red-300">{error}</div>
      ) : !app ? (
        <p className="m-auto text-sm text-tenue">Revisando FilmCraft…</p>
      ) : app.instalada ? (
        <iframe ref={marco} title="FilmCraft" src="/craft/filmcraft/index.html?host=parent" className="w-full flex-1 border-0"
          allow="clipboard-read; clipboard-write; fullscreen" />
      ) : (
        <div className="m-auto max-w-md space-y-3 p-6 text-center text-sm">
          <p>Para abrir el proyecto hace falta FilmCraft, el editor de video de Media. Es gratis y se instala una vez.</p>
          {instalando ? <p role="status">{app.instalacion?.detalle || "Instalando FilmCraft…"}</p> : (
            <button className="boton boton-primario" onClick={instalar}>{app.instalacion?.fase === "error" ? "Intentar de nuevo" : "Instalar FilmCraft"}</button>
          )}
          {app.instalacion?.fase === "error" && <p className="text-red-300">{app.instalacion.detalle}</p>}
        </div>
      )}
    </div>
  );
}
