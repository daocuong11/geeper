"use client";
import { useEffect, useState } from "react";
import { Aviso, archivo, pedir, postJson, useSondeo } from "./comun";

interface Kokoro { voz: string; nombre: string; detalle: string }
interface Guardada { id: string; nombre: string; descripcion: string; muestra: string }
interface Voces { instalada: boolean; licencia: string; kokoro: Kokoro[]; guardadas: Guardada[] }
interface Diseno { estado: string; etapa: string; error: string | null; tomas: string[] }

export type MotorVoz = "kokoro" | "mpt" | "voxcpm";

const EJEMPLOS = [
  "Narradora cálida y tranquila, como de documental",
  "Locutor de radio con energía, voz clara y alegre",
  "Narrador de voz grave y misteriosa, ritmo pausado",
  "Mujer joven y cercana, como una amiga que cuenta algo curioso",
];

/** ¿Es ésta la voz que tiene el proyecto? (MPT antepone «kokoro:»). */
function enUso(actual: { motor: string; voz: string }, motor: MotorVoz, voz: string): boolean {
  if (motor === "voxcpm") return actual.motor === "voxcpm" && actual.voz === voz;
  return actual.motor !== "voxcpm" && actual.voz.split(":").pop() === voz;
}

function Escuchar({ ruta, kokoro }: { ruta?: string; kokoro?: string }) {
  const [src, setSrc] = useState<string | null>(ruta ? archivo(ruta) : null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (src) return <audio controls preload="none" src={src} className="h-8 w-full" />;
  return (
    <div className="space-y-1">
      <button type="button" className="boton" disabled={cargando} onClick={() => {
        setCargando(true);
        pedir<{ ruta: string }>(`/api/voces/muestra?kokoro=${kokoro}`)
          .then((r) => setSrc(archivo(r.ruta)))
          .catch((e: Error) => setError(e.message))
          .finally(() => setCargando(false));
      }}>{cargando ? "Preparando la muestra…" : "▶ Escuchar"}</button>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

/**
 * Elegir la voz del video escuchándola (no por el nombre del modelo) y crear una nueva describiéndola.
 * `usar` cambia la voz del proyecto y ofrece ponerla en el video (regenerar el guion completo).
 */
export function ElegirVoz({ actual, idioma, usar, ocupado }: { actual: { motor: string; voz: string }; idioma: string; usar: (motor: MotorVoz, voz: string, nombre: string) => Promise<void>; ocupado: boolean }) {
  const { datos, recargar } = useSondeo<Voces>(`/api/voces?idioma=${encodeURIComponent(idioma)}`, 60_000);
  const [abierto, setAbierto] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [pedido, setPedido] = useState<{ propuesta: string; trabajo: string } | null>(null);
  const [diseno, setDiseno] = useState<Diseno | null>(null);
  const [elegida, setElegida] = useState(1);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Mientras se diseña, se consulta el avance cada 3 s.
  useEffect(() => {
    if (!pedido) return;
    let vivo = true;
    const tick = async () => {
      try {
        const d = await pedir<Diseno>(`/api/voces/disenar?propuesta=${pedido.propuesta}&trabajo=${pedido.trabajo}`);
        if (!vivo) return;
        setDiseno(d);
        if (d.estado === "pendiente" || d.estado === "corriendo") setTimeout(() => void tick(), 3000);
      } catch (e) {
        if (vivo) setError((e as Error).message);
      }
    };
    void tick();
    return () => {
      vivo = false;
    };
  }, [pedido]);

  async function disenar() {
    setError(null);
    setDiseno(null);
    try {
      setPedido(await postJson<{ propuesta: string; trabajo: string }>("/api/voces/disenar", { descripcion }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function guardar() {
    if (!pedido) return;
    setError(null);
    try {
      const r = await postJson<{ voz: { id: string; nombre: string } }>("/api/voces", { propuesta: pedido.propuesta, toma: elegida, nombre: nombre || descripcion.slice(0, 40) });
      setAviso(`«${r.voz.nombre}» quedó guardada en tu biblioteca de voces. Ya puedes usarla en este y en cualquier otro video.`);
      setPedido(null);
      setDiseno(null);
      setDescripcion("");
      setNombre("");
      setAbierto(false);
      recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const tarjeta = (clave: string, titulo: string, detalle: string, escuchar: React.ReactNode, motor: MotorVoz, voz: string) => {
    const usa = enUso(actual, motor, voz);
    return (
      <li key={clave} className={`space-y-2 rounded-lg border p-3 ${usa ? "border-sky-500 bg-sky-950/30" : "border-borde"}`}>
        <div>
          <p className="font-medium">{titulo}{usa && <span className="ml-2 rounded bg-sky-800 px-1.5 py-0.5 text-xs">En uso</span>}</p>
          <p className="text-xs text-tenue">{detalle}</p>
        </div>
        {escuchar}
        {!usa && <button type="button" className="boton" disabled={ocupado} onClick={() => void usar(motor, voz, titulo)}>Usar esta voz</button>}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">Voz del video</h3>
        <p className="text-xs text-tenue">Escucha cada una y elige la que más te guste. Al cambiarla, la voz nueva dice el mismo guion y los subtítulos se acomodan solos.</p>
      </div>
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(datos?.kokoro ?? []).map((k) => tarjeta(k.voz, k.nombre, `${k.detalle} · rápida, no usa la tarjeta gráfica`, <Escuchar kokoro={k.voz} />, "kokoro", k.voz))}
        {(datos?.guardadas ?? []).map((g) => tarjeta(g.id, g.nombre, `Creada por ti: «${g.descripcion}» · más natural, usa la tarjeta gráfica`, <Escuchar ruta={g.muestra} />, "voxcpm", g.id))}
      </ul>

      {datos && !datos.instalada ? (
        <p className="text-xs text-tenue">Crear voces nuevas necesita VoxCPM2, que no está instalado en esta computadora.</p>
      ) : !abierto ? (
        <button type="button" className="boton" onClick={() => setAbierto(true)}>+ Crear una voz nueva describiéndola</button>
      ) : (
        <div className="space-y-2 rounded-lg border border-borde p-3">
          <label className="etiqueta" htmlFor="desc-voz">¿Cómo quieres que suene? Descríbela con tus palabras</label>
          <textarea id="desc-voz" className="campo min-h-16" maxLength={300} value={descripcion} disabled={Boolean(pedido)}
            placeholder="Por ejemplo: narradora cálida y tranquila, como de documental" onChange={(e) => setDescripcion(e.target.value)} />
          {!pedido && (
            <div className="flex flex-wrap gap-1">
              {EJEMPLOS.map((e) => <button key={e} type="button" className="rounded-full border border-borde px-2 py-0.5 text-xs hover:bg-white/5" onClick={() => setDescripcion(e)}>{e}</button>)}
            </div>
          )}
          <p className="text-xs text-tenue">Se crean 3 opciones distintas para que elijas. Tarda unos 2 minutos y usa la tarjeta gráfica (si está ocupada, espera su turno). Sólo voces inventadas: no imites a una persona real.</p>
          {!pedido && (
            <div className="flex gap-2">
              <button type="button" className="boton boton-primario" disabled={descripcion.trim().length < 8} onClick={() => void disenar()}>Crear 3 opciones</button>
              <button type="button" className="boton" onClick={() => setAbierto(false)}>Cancelar</button>
            </div>
          )}
          {pedido && diseno && (diseno.estado === "pendiente" || diseno.estado === "corriendo") && (
            <p className="text-sm" role="status">{diseno.estado === "pendiente" ? "En la fila, esperando su turno…" : diseno.etapa || "Creando las voces…"}</p>
          )}
          {pedido && diseno?.estado === "fallido" && (
            <Aviso tipo="error">
              No se pudieron crear las voces: {diseno.error}
              <button type="button" className="boton ml-2" onClick={() => { setPedido(null); setDiseno(null); }}>Probar de nuevo</button>
            </Aviso>
          )}
          {pedido && diseno?.estado === "hecho" && (
            <fieldset className="space-y-2">
              <legend className="etiqueta">Escucha las opciones y quédate con la que más te guste</legend>
              {diseno.tomas.map((t, i) => (
                <label key={t} className={`flex items-center gap-2 rounded border p-2 ${elegida === i + 1 ? "border-sky-500" : "border-borde"}`}>
                  <input type="radio" name="toma" checked={elegida === i + 1} onChange={() => setElegida(i + 1)} />
                  <span className="w-20 shrink-0 text-sm">Opción {i + 1}</span>
                  <audio controls preload="none" src={archivo(t)} className="h-8 w-full" />
                </label>
              ))}
              <label className="etiqueta" htmlFor="nombre-voz">Ponle un nombre</label>
              <input id="nombre-voz" className="campo" maxLength={60} value={nombre} placeholder="Por ejemplo: Narradora del canal" onChange={(e) => setNombre(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" className="boton boton-primario" onClick={() => void guardar()}>Guardar esta voz</button>
                <button type="button" className="boton" onClick={() => { setPedido(null); setDiseno(null); }}>Ninguna me gusta: describir otra vez</button>
              </div>
            </fieldset>
          )}
          {error && <Aviso tipo="error">{error}</Aviso>}
        </div>
      )}
    </div>
  );
}
