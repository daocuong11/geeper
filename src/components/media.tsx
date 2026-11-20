"use client";
import Link from "next/link";
import { useState } from "react";
import type { AppCraft, GrupoCraft } from "@/lib/craft-web";
import { Aviso, Barra, pedir, useSondeo } from "./comun";

interface EstadoInstalacion {
  fase: "inactiva" | "descargando" | "verificando" | "descomprimiendo" | "lista" | "error";
  progreso: number;
  detalle: string;
}
type FilaApp = AppCraft & { release: string; instalada: string | null; instalacion: EstadoInstalacion | null };

const GRUPOS: GrupoCraft[] = ["Imagen y diseño", "Video y sonido", "Documentos", "3D y técnico"];
const instalando = (e: EstadoInstalacion | null) => !!e && ["descargando", "verificando", "descomprimiendo"].includes(e.fase);

/** Media: las apps Craft con su interfaz original, instalables con un clic y abiertas dentro de Geeper. */
export function Media() {
  const { datos, error } = useSondeo<FilaApp[]>("/api/media", 2000);
  const [msg, setMsg] = useState<string | null>(null);

  async function instalar(a: FilaApp) {
    setMsg(null);
    try {
      await pedir(`/api/media/${a.app}`, { method: "POST" });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Media</h1>
        <p className="mt-1 max-w-3xl text-sm text-tenue">
          Las apps Craft de <a className="underline" href="https://github.com/storytold" target="_blank" rel="noreferrer">storytold</a> con
          su interfaz original, dentro de Geeper. Cada una se instala una vez (la versión oficial, verificada) y se abre a pantalla completa.
          Abrir y guardar usan el selector de archivos del navegador: lo que guardes se descarga a tu carpeta de Descargas.
          Sus menús están en inglés.
        </p>
      </div>
      {error && <Aviso tipo="error">No se pudo leer la lista: {error}</Aviso>}
      {msg && <Aviso tipo="error">{msg}</Aviso>}
      {!datos && !error && <p className="text-sm text-tenue">Cargando…</p>}
      {datos && GRUPOS.map((g) => (
        <section key={g} aria-labelledby={`grupo-${g}`}>
          <h2 id={`grupo-${g}`} className="mb-2 font-medium">{g}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {datos.filter((a) => a.grupo === g).map((a) => (
              <li key={a.app} className="tarjeta flex flex-col gap-2 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-medium">{a.nombre}</h3>
                  <span className="text-xs text-tenue">como {a.comoA}</span>
                </div>
                <p className="text-sm">{a.que}</p>
                {a.paraGeeper && <p className="text-xs text-tenue">En Geeper: {a.paraGeeper}</p>}
                <div className="mt-auto space-y-2 pt-2">
                  {a.soloEscritorio ? (
                    <p className="text-xs text-tenue">
                      No tiene versión para el navegador.{" "}
                      <a className="underline" href={a.release} target="_blank" rel="noreferrer">Descargar para Windows</a>
                    </p>
                  ) : instalando(a.instalacion) ? (
                    <>
                      <Barra valor={a.instalacion!.progreso} />
                      <p className="text-xs text-tenue" role="status">{a.instalacion!.detalle}</p>
                    </>
                  ) : a.instalada ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/media/${a.app}`} className="boton boton-primario">Abrir {a.nombre}</Link>
                      <a href={`/craft/${a.app}/index.html`} target="_blank" rel="noreferrer" className="text-xs text-tenue underline">en otra pestaña</a>
                      <span className="ml-auto text-xs text-tenue">{a.instalada}</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className="boton" onClick={() => void instalar(a)}>Instalar ({a.version})</button>
                      <span className="text-xs text-tenue">entre 15 y 100 MB</span>
                    </div>
                  )}
                  {a.instalacion?.fase === "error" && <p className="text-xs text-red-300" role="alert">No se instaló: {a.instalacion.detalle}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Una app Craft a pantalla completa, con una barra mínima para volver. */
export function AppCraftAbierta({ app, nombre, version }: { app: string; nombre: string; version: string | null }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1b1b1b]">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-borde bg-[#0f131a] px-3 text-sm">
        <Link href="/media" className="text-tenue hover:text-white">← Media</Link>
        <span className="font-medium">{nombre}</span>
        {version && <span className="text-xs text-tenue">{version}</span>}
        <span className="hidden text-xs text-tenue sm:inline">Guarda antes de salir: lo que no descargues se pierde.</span>
        <a href={`/craft/${app}/index.html`} target="_blank" rel="noreferrer" className="ml-auto text-xs text-tenue underline">Abrir en otra pestaña</a>
      </div>
      {version ? (
        <iframe title={nombre} src={`/craft/${app}/index.html`} className="w-full flex-1 border-0"
          allow="clipboard-read; clipboard-write; fullscreen" />
      ) : (
        <div className="m-auto max-w-md p-6 text-center text-sm">
          <p>{nombre} todavía no está instalada.</p>
          <Link href="/media" className="boton mt-3 inline-block">Ir a Media para instalarla</Link>
        </div>
      )}
    </div>
  );
}
