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
  siguiente: { titulo: string; etapa: number; listo?: boolean };
}

const PASOS = [
  ["Tu negocio", "Contestas 4 preguntas: qué vendes, qué quieres lograr, dónde y qué ofreces."],
  ["Ideas y videos", "El asistente te propone ideas (o escribes las tuyas) y Geeper hace cada video con su guion."],
  ["Revisión", "Geeper revisa cada video y te dice, en orden, qué falta antes de publicarlo."],
  ["Comparar", "Publicas dos ideas a la vez y Geeper te dice cuál ganó de verdad, sin adivinar."],
];

export function ListaCampanas() {
  const { datos, error } = useSondeo<{ campanas: CampanaV[] }>("/api/anuncios", 10000);
  const [creando, setCreando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const router = useRouter();

  async function verEjemplo() {
    setCreando(true);
    setFallo(null);
    try {
      const r = await postJson<{ campana: { id: string } }>("/api/anuncios", { ejemplo: true });
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
            Crea anuncios en video para Instagram, TikTok, YouTube y más: Geeper te ayuda con las ideas, hace los videos, los revisa y te dice cuál funcionó mejor. No toca tus cuentas: tú los publicas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="boton" onClick={() => void verEjemplo()} disabled={creando}>Ver un ejemplo</button>
          <Link href="/anuncios/nueva" className="boton boton-primario px-4">+ Nueva campaña</Link>
        </div>
      </div>
      {(error || fallo) && <Aviso tipo="error">{fallo ?? error}</Aviso>}

      {datos && campanas.length === 0 && (
        <div className="tarjeta p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Cómo funciona</h2>
            <div className="flex gap-2">
              <button className="boton" onClick={() => void verEjemplo()} disabled={creando}>Ver un ejemplo primero</button>
              <Link href="/anuncios/nueva" className="boton boton-primario">Crear mi primera campaña</Link>
            </div>
          </div>
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
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <p className={`rounded-md px-2 py-1.5 text-sm ${c.siguiente.listo ? "bg-emerald-950/40 text-emerald-200" : "bg-cyan-950/40 text-cyan-100"}`}>
              <span className="text-xs text-tenue">Siguiente: </span>{c.siguiente.titulo}
            </p>
            <div className="mt-auto space-y-2">
              <BarraResumen r={c.resumen} />
              <div className="flex items-center justify-between gap-2">
                <Contadores r={c.resumen} compacto />
                <span className="text-xs text-tenue tabular-nums">{c.conceptos} idea{c.conceptos === 1 ? "" : "s"} · {c.conVideo} con video</span>
              </div>
            </div>
            {c.invalida && <Aviso tipo="alerta">Los datos guardados no pasan el esquema actual.</Aviso>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
