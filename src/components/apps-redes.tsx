"use client";
import { useState } from "react";
import { Aviso, pedir, useSondeo } from "./comun";

interface Campo { clave: string; etiqueta: string; secreto: boolean; tipo?: "texto" | "si-no"; ayuda?: string }
interface App {
  red: string;
  nombre: string;
  configurada: boolean;
  id: string | null;
  redirect: string;
  consola: string;
  campos: Campo[];
  pasos: string[];
  opciones: Record<string, boolean>;
}

const enviarJson = (url: string, metodo: string, cuerpo: unknown) =>
  pedir<{ apps: App[]; importadas?: string[] }>(url, { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });

function Copiar({ texto }: { texto: string }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button type="button" className="boton py-0.5 text-xs" onClick={() => void navigator.clipboard.writeText(texto).then(() => { setHecho(true); setTimeout(() => setHecho(false), 1500); })}>
      {hecho ? "Copiado" : "Copiar"}
    </button>
  );
}

function FormApp({ app, alGuardar, alCancelar }: { app: App; alGuardar: (apps: App[]) => void; alCancelar: () => void }) {
  const [datos, setDatos] = useState<Record<string, string | boolean>>(() => ({ ...app.opciones }));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      alGuardar((await enviarJson("/api/cuentas/credenciales", "PUT", { red: app.red, datos })).apps);
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="mt-3 space-y-3 border-t border-borde pt-3" onSubmit={(e) => void guardar(e)}>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {app.pasos.map((p) => <li key={p}>{p}</li>)}
      </ol>
      <p className="text-sm">
        <a className="underline" href={app.consola} target="_blank" rel="noreferrer">Abrir la consola de desarrolladores de {app.nombre}</a>
      </p>
      <div className="space-y-1">
        <p className="text-xs text-tenue">Redirect URI (pégalo tal cual en la app de {app.nombre}):</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-black/30 px-2 py-1 text-xs [overflow-wrap:anywhere]">{app.redirect}</code>
          <Copiar texto={app.redirect} />
        </div>
      </div>
      {app.campos.map((c) =>
        c.tipo === "si-no" ? (
          <label key={c.clave} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={datos[c.clave] === true} onChange={(e) => setDatos({ ...datos, [c.clave]: e.target.checked })} />
            <span>{c.etiqueta}{c.ayuda && <span className="block text-xs text-tenue">{c.ayuda}</span>}</span>
          </label>
        ) : (
          <label key={c.clave} className="block text-sm">
            <span className="mb-1 block">{c.etiqueta}{app.configurada && c.secreto && <span className="text-xs text-tenue"> (vuelve a pegarlo: no se muestra el guardado)</span>}</span>
            <input
              className="campo w-full font-mono text-xs"
              type={c.secreto ? "password" : "text"}
              autoComplete="off"
              spellCheck={false}
              required
              maxLength={500}
              value={typeof datos[c.clave] === "string" ? (datos[c.clave] as string) : ""}
              onChange={(e) => setDatos({ ...datos, [c.clave]: e.target.value })}
            />
          </label>
        ),
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex gap-2">
        <button type="submit" className="boton boton-primario" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
        <button type="button" className="boton" onClick={alCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

function Equipo({ hayAlguna, alImportar }: { hayAlguna: boolean; alImportar: (apps: App[], importadas: string[]) => void }) {
  const [modo, setModo] = useState<"exportar" | "importar" | null>(null);
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [archivo, setArchivo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cerrar = () => { setModo(null); setClave(""); setClave2(""); setArchivo(null); setError(null); };

  async function exportar(e: React.FormEvent) {
    e.preventDefault();
    if (clave !== clave2) return setError("Las dos contraseñas no coinciden.");
    setError(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/cuentas/credenciales/exportar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contrasena: clave }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Error ${r.status}`);
      const nombre = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "geeper-redes.geeper-redes";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.blob());
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(a.href);
      cerrar();
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x));
    } finally {
      setOcupado(false);
    }
  }

  async function importar(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo) return setError("Elige el archivo que te pasaron.");
    setError(null);
    setOcupado(true);
    try {
      const r = await enviarJson("/api/cuentas/credenciales/importar", "POST", { archivo, contrasena: clave });
      alImportar(r.apps, r.importadas ?? []);
      cerrar();
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-borde pt-3">
      <p className="text-sm font-medium">Para el equipo</p>
      <p className="text-xs text-tenue">
        Quien registró las apps las exporta en un archivo cifrado con una contraseña; los demás lo importan aquí y ya pueden conectar sus cuentas.
        Pasa la contraseña por otro medio que el archivo.
      </p>
      {!modo && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="boton" disabled={!hayAlguna} onClick={() => setModo("exportar")}>Exportar para el equipo</button>
          <button type="button" className="boton" onClick={() => setModo("importar")}>Importar archivo del equipo</button>
        </div>
      )}
      {modo === "exportar" && (
        <form className="space-y-2" onSubmit={(e) => void exportar(e)}>
          <label className="block text-sm">Contraseña (mínimo 10 caracteres)
            <input className="campo mt-1 w-full" type="password" autoComplete="new-password" minLength={10} required value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
          <label className="block text-sm">Repítela
            <input className="campo mt-1 w-full" type="password" autoComplete="new-password" minLength={10} required value={clave2} onChange={(e) => setClave2(e.target.value)} />
          </label>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="flex gap-2">
            <button type="submit" className="boton boton-primario" disabled={ocupado}>{ocupado ? "Cifrando…" : "Descargar archivo"}</button>
            <button type="button" className="boton" onClick={cerrar}>Cancelar</button>
          </div>
        </form>
      )}
      {modo === "importar" && (
        <form className="space-y-2" onSubmit={(e) => void importar(e)}>
          <label className="block text-sm">Archivo (.geeper-redes)
            <input className="mt-1 block text-sm" type="file" accept=".geeper-redes,application/json" required onChange={(e) => void e.target.files?.[0]?.text().then(setArchivo)} />
          </label>
          <label className="block text-sm">Contraseña
            <input className="campo mt-1 w-full" type="password" autoComplete="off" required value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="flex gap-2">
            <button type="submit" className="boton boton-primario" disabled={ocupado}>{ocupado ? "Importando…" : "Importar"}</button>
            <button type="button" className="boton" onClick={cerrar}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * «Apps de las redes»: las credenciales de OAuth de YouTube, TikTok y Meta, cargadas desde la UI (se
 * guardan en redes.json, privado). Se hace una vez; después, cada persona sólo pulsa «Conectar».
 */
export function AppsRedes({ alCambiar }: { alCambiar: () => void }) {
  const { datos, error, recargar } = useSondeo<{ apps: App[] }>("/api/cuentas/credenciales", 60_000);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; t: string } | null>(null);
  const [apps, setApps] = useState<App[] | null>(null);
  const lista = apps ?? datos?.apps ?? null;

  const listo = (nuevas: App[], texto: string) => {
    setApps(nuevas);
    setAbierta(null);
    setMsg({ tipo: "ok", t: texto });
    void recargar();
    alCambiar();
  };

  async function quitar(a: App) {
    if (!confirm(`¿Quitar las credenciales de la app de ${a.nombre} de este equipo? Las cuentas conectadas no se desconectan, pero no se podrán conectar nuevas hasta cargarlas otra vez.`)) return;
    try {
      listo((await pedir<{ apps: App[] }>(`/api/cuentas/credenciales?red=${a.red}`, { method: "DELETE" })).apps, `Se quitaron las credenciales de ${a.nombre}.`);
    } catch (x) {
      setMsg({ tipo: "error", t: x instanceof Error ? x.message : String(x) });
    }
  }

  if (!lista) return error ? <Aviso tipo="error">{error}</Aviso> : null;
  const faltan = lista.filter((a) => !a.configurada).length;
  return (
    <section className="tarjeta space-y-3 p-4" aria-labelledby="apps-redes">
      <div>
        <h2 id="apps-redes" className="font-medium">Apps de las redes</h2>
        <p className="text-sm text-tenue">
          Cada red pide una «app de desarrollador» para dejar que Geeper publique. Se registra una sola vez (o se importa el archivo del equipo);
          después cada persona sólo pulsa «Conectar» e inicia sesión con su cuenta.
          {faltan > 0 && ` Faltan ${faltan}.`}
        </p>
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.t}</Aviso>}
      <ul className="space-y-2">
        {lista.map((a) => (
          <li key={a.red} className="rounded border border-borde p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span aria-hidden className={a.configurada ? "text-emerald-400" : "text-amber-300"}>{a.configurada ? "✓" : "!"}</span>
              <span className="font-medium">{a.nombre}</span>
              <span className="text-xs text-tenue">{a.configurada ? `cargada (ID ${a.id})` : "falta la app"}</span>
              <div className="ml-auto flex gap-2">
                {a.configurada && <button type="button" className="boton py-0.5 text-xs" onClick={() => void quitar(a)}>Quitar</button>}
                <button type="button" className={`boton py-0.5 text-xs ${a.configurada ? "" : "boton-primario"}`} aria-expanded={abierta === a.red} onClick={() => setAbierta(abierta === a.red ? null : a.red)}>
                  {abierta === a.red ? "Cerrar" : a.configurada ? "Cambiar" : "Configurar"}
                </button>
              </div>
            </div>
            {abierta === a.red && <FormApp app={a} alGuardar={(n) => listo(n, `Se guardó la app de ${a.nombre}. Ya puedes conectar cuentas abajo.`)} alCancelar={() => setAbierta(null)} />}
          </li>
        ))}
      </ul>
      <Equipo hayAlguna={lista.some((a) => a.configurada)} alImportar={(n, redes) => listo(n, redes.length ? `Se importaron: ${redes.join(", ")}.` : "El archivo no traía credenciales.")} />
    </section>
  );
}
