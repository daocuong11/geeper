"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OBJETIVOS, ubicacion } from "@/lib/anuncios/catalogo";
import { Aviso, Estado, postJson, useSondeo } from "../comun";
import { BarraResumen, Contadores, type Resumen } from "./ui";

interface CampanaV {
  id: string;
  nombre: string;
  estado: string;
  actualizado: string;
  marca: string;
  objetivo: keyof typeof OBJETIVOS;
  ubicaciones: string[];
  conceptos: number;
  conVideo: number;
  resumen: Resumen;
  invalida: boolean;
}

const PASOS = [
  ["Brief", "Qué se anuncia, a quién, dónde y qué se puede afirmar (con su prueba)."],
  ["Conceptos", "Ideas materialmente distintas, cada una con gancho, guion y CTA. Geeper genera el video con el guion exacto."],
  ["Revisión", "Cada chequeo pasa, falla o queda «sin saber», con su evidencia. Lo que falta no se adivina."],
  ["Prueba", "Una sola variable, métrica primaria, guardarraíles y tamaño de muestra decidido antes de lanzar."],
];

export function ListaCampanas() {
  const { datos, error } = useSondeo<{ campanas: CampanaV[] }>("/api/anuncios", 10000);
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const router = useRouter();

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setFallo(null);
    try {
      const r = await postJson<{ campana: { id: string } }>("/api/anuncios", { nombre });
      router.push(`/anuncios/${r.campana.id}`);
    } catch (err) {
      setFallo(err instanceof Error ? err.message : String(err));
      setCreando(false);
    }
  }

  const campanas = datos?.campanas ?? [];
  const activas = campanas.filter((c) => c.estado !== "archivada");
  const archivadas = campanas.filter((c) => c.estado === "archivada");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Anuncios</h1>
          <p className="mt-1 max-w-2xl text-sm text-tenue">
            Del brief al video listo para el administrador de anuncios, con cada chequeo respaldado por evidencia. Geeper no toca tus cuentas de anuncios: prepara y revisa.
          </p>
        </div>
        <form onSubmit={crear} className="flex w-full gap-2 sm:w-auto">
          <input className="campo sm:w-72" placeholder="Nombre de la campaña nueva" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre de la campaña nueva" maxLength={120} />
          <button className="boton boton-primario shrink-0" disabled={creando || !nombre.trim()}>{creando ? "Creando…" : "Nueva campaña"}</button>
        </form>
      </div>
      {(error || fallo) && <Aviso tipo="error">{fallo ?? error}</Aviso>}

      {datos && campanas.length === 0 && (
        <div className="tarjeta p-6">
          <h2 className="font-semibold">Cómo funciona</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PASOS.map(([t, d], i) => (
              <li key={t} className="rounded-lg border border-borde bg-[#0f131a] p-4">
                <span className="text-xs font-semibold text-acento">Paso {i + 1}</span>
                <p className="mt-1 font-medium">{t}</p>
                <p className="mt-1 text-sm text-tenue">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {activas.length > 0 && <Rejilla campanas={activas} />}
      {archivadas.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-tenue hover:text-white">Archivadas ({archivadas.length})</summary>
          <div className="mt-3 opacity-80"><Rejilla campanas={archivadas} /></div>
        </details>
      )}
      {!datos && !error && <p className="text-sm text-tenue">Cargando…</p>}
    </div>
  );
}

function Rejilla({ campanas }: { campanas: CampanaV[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {campanas.map((c) => (
        <li key={c.id}>
          <Link href={`/anuncios/${c.id}`} className="tarjeta flex h-full flex-col gap-3 p-4 transition-colors hover:border-cyan-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{c.nombre}</p>
                <p className="truncate text-sm text-tenue">{[c.marca, OBJETIVOS[c.objetivo]].filter(Boolean).join(" · ")}</p>
              </div>
              <Estado valor={c.estado} />
            </div>
            <p className="line-clamp-2 text-xs text-tenue">{c.ubicaciones.map((u) => ubicacion(u)?.nombre ?? u).join(" · ") || "Sin ubicaciones"}</p>
            <div className="mt-auto space-y-2">
              <BarraResumen r={c.resumen} />
              <div className="flex items-center justify-between gap-2">
                <Contadores r={c.resumen} compacto />
                <span className="text-xs text-tenue tabular-nums">{c.conceptos} concepto{c.conceptos === 1 ? "" : "s"} · {c.conVideo} con video</span>
              </div>
            </div>
            {c.invalida && <Aviso tipo="alerta">Los datos guardados no pasan el esquema actual.</Aviso>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
