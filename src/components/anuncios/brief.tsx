"use client";
import { BOTONES_CTA, CATEGORIAS_SENSIBLES, OBJETIVOS, UBICACIONES } from "@/lib/anuncios/catalogo";
import type { Brief } from "@/lib/anuncios/esquema";
import { Aviso, useSondeo } from "../comun";
import type { Ctx } from "./campana";
import { MarcaDesdeWeb } from "./marca-web";
import { OBJETIVO_SIMPLE, QUE } from "./textos";
import { Campo, Chip, Seccion, nuevoId } from "./ui";

const REDES: { id: (typeof UBICACIONES)[number]["red"]; nombre: string }[] = [
  { id: "youtube", nombre: "YouTube" },
  { id: "tiktok", nombre: "TikTok" },
  { id: "instagram", nombre: "Instagram" },
  { id: "facebook", nombre: "Facebook" },
  { id: "linkedin", nombre: "LinkedIn" },
];

export function PestanaBrief({ ctx }: { ctx: Ctx }) {
  const b = ctx.datos.brief;
  const { datos: pl } = useSondeo<{ plantillas: { slug: string; nombre: string }[] }>("/api/plantillas", 60000);
  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => ctx.cambiar((d) => ({ ...d, brief: { ...d.brief, [k]: v } }));
  const alternarUbicacion = (id: string) =>
    set("ubicaciones", (b.ubicaciones.includes(id as never) ? b.ubicaciones.filter((u) => u !== id) : [...b.ubicaciones, id]) as Brief["ubicaciones"]);

  const afs = b.afirmaciones;
  const setAf = (i: number, cambio: Partial<Brief["afirmaciones"][number]>) => set("afirmaciones", afs.map((a, j) => (j === i ? { ...a, ...cambio } : a)));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Seccion titulo="Qué vendes" descripcion="Con esto se escriben las ideas y se revisa cada anuncio.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Marca"><input className="campo" value={b.marca} maxLength={120} onChange={(e) => set("marca", e.target.value)} /></Campo>
          <Campo etiqueta="¿Qué vendes?"><input className="campo" value={b.producto} maxLength={200} onChange={(e) => set("producto", e.target.value)} /></Campo>
          <Campo etiqueta="¿Qué quieres lograr?" que={QUE.objetivo}>
            <select className="campo" value={b.objetivo} onChange={(e) => set("objetivo", e.target.value as Brief["objetivo"])}>
              {Object.keys(OBJETIVOS).map((k) => <option key={k} value={k}>{OBJETIVO_SIMPLE[k]?.titulo}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Botón del anuncio" que={QUE.boton}>
            <select className="campo" value={b.botonCta} onChange={(e) => set("botonCta", e.target.value as Brief["botonCta"])}>
              {BOTONES_CTA.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Campo>
        </div>
        <Campo etiqueta="¿Qué ofreces?" que={QUE.oferta} ayuda="Con sus condiciones: precio, plazo, región.">
          <textarea className="campo min-h-20" value={b.oferta} maxLength={600} onChange={(e) => set("oferta", e.target.value)} />
        </Campo>
        <Campo etiqueta="¿A qué página lleva el anuncio?" que={QUE.destino}>
          <input className="campo" type="url" inputMode="url" placeholder="https://" value={b.destino} maxLength={500} onChange={(e) => set("destino", e.target.value)} />
        </Campo>
      </Seccion>

      <Seccion titulo="A quién le hablas" descripcion="Escribe lo que sabes de tus clientes de verdad, no suposiciones.">
        <Campo etiqueta="¿Quién es tu cliente?" que={QUE.audiencia}>
          <textarea className="campo min-h-28" value={b.audiencia} maxLength={1000} onChange={(e) => set("audiencia", e.target.value)} placeholder="Ej.: personas que toman café en casa todos los días; nos preguntan si el café llega fresco." />
        </Campo>
        <Campo etiqueta="¿Es un tema delicado?" que={QUE.categoria}>
          <select className="campo" value={b.categoria} onChange={(e) => set("categoria", e.target.value as Brief["categoria"])}>
            {Object.entries(CATEGORIAS_SENSIBLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        {b.categoria !== "ninguna" && (
          <Aviso tipo="alerta">Categoría sensible: cada red pide permisos, certificaciones o aclaraciones distintas según el país. La revisión de política de cada ubicación lo marca como obligatorio.</Aviso>
        )}
      </Seccion>

      <Seccion titulo="Dónde se verá" descripcion="Toca los lugares donde vas a mostrar el anuncio. El número es la forma del video: 9:16 vertical, 16:9 horizontal, 1:1 cuadrado.">
        <div className="space-y-3">
          {REDES.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2">
              <span className="w-20 shrink-0 text-sm text-tenue">{r.nombre}</span>
              {UBICACIONES.filter((u) => u.red === r.id).map((u) => (
                <Chip key={u.id} activo={b.ubicaciones.includes(u.id as never)} onClick={() => alternarUbicacion(u.id)}>
                  {u.nombre.replace(`${r.nombre} `, "")}
                  <span className="rounded bg-black/30 px-1 text-[0.7rem] tabular-nums">{u.formato}</span>
                </Chip>
              ))}
            </div>
          ))}
        </div>
        {b.ubicaciones.length === 0 && <Aviso tipo="alerta">Elige al menos una ubicación.</Aviso>}
        <Campo etiqueta="Estilo de los videos" que={QUE.plantilla}>
          <select className="campo" value={b.plantilla} onChange={(e) => set("plantilla", e.target.value)}>
            <option value="">La primera disponible</option>
            {pl?.plantillas.map((p) => <option key={p.slug} value={p.slug}>{p.nombre}</option>)}
          </select>
        </Campo>
      </Seccion>

      <Seccion
        titulo="Datos que puedes decir"
        descripcion="Si el anuncio dice un dato («envío gratis», «30 % más barato»), anótalo aquí con lo que lo demuestra y apruébalo."
        accion={<button className="boton shrink-0" onClick={() => set("afirmaciones", [...afs, { id: nuevoId("af"), texto: "", prueba: "", aprobada: false }])}>+ Dato</button>}
      >
        {afs.length === 0 && <p className="text-sm text-tenue">Ninguno todavía. Si una idea dice algo como «el más rápido» o «30 % menos», Geeper te lo pedirá aquí. <span className="text-slate-300">{QUE.afirmaciones}</span></p>}
        <ul className="space-y-3">
          {afs.map((a, i) => (
            <li key={a.id} className={`rounded-lg border p-3 ${a.aprobada ? "border-emerald-800/70 bg-emerald-950/20" : "border-borde bg-[#0f131a]"}`}>
              <div className="flex gap-2">
                <input className="campo" placeholder="El dato (ej.: «Envío gratis en todo el país»)" value={a.texto} maxLength={300} onChange={(e) => setAf(i, { texto: e.target.value })} aria-label="Afirmación" />
                <button className="boton shrink-0" aria-label="Quitar afirmación" onClick={() => set("afirmaciones", afs.filter((_, j) => j !== i))}>✕</button>
              </div>
              <input className="campo mt-2" placeholder="Cómo lo demuestras (ej.: política de envíos publicada en la web)" value={a.prueba} maxLength={500} onChange={(e) => setAf(i, { prueba: e.target.value })} aria-label="Prueba" />
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={a.aprobada} disabled={!a.prueba.trim() && !a.aprobada} onChange={(e) => setAf(i, { aprobada: e.target.checked })} />
                Es cierto y lo puedo demostrar: aprobado para anuncios
                {!a.prueba.trim() && <span className="text-xs text-tenue">(primero escribe cómo lo demuestras)</span>}
              </label>
            </li>
          ))}
        </ul>
      </Seccion>

      <div className="lg:col-span-2">
        <MarcaDesdeWeb ctx={ctx} />
      </div>

      <div className="lg:col-span-2">
        <Seccion titulo="Notas">
          <textarea className="campo min-h-20" value={b.notas} maxLength={2000} onChange={(e) => set("notas", e.target.value)} placeholder="Restricciones de marca, quién aprueba, fechas…" aria-label="Notas" />
        </Seccion>
      </div>
    </div>
  );
}
