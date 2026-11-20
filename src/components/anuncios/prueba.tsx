"use client";
import { UNIDADES_PRUEBA, VARIABLES_PRUEBA } from "@/lib/anuncios/catalogo";
import type { Prueba } from "@/lib/anuncios/esquema";
import { leerPrueba, type Veredicto } from "@/lib/anuncios/lectura";
import { tamanoMuestra } from "@/lib/anuncios/muestra";
import { Aviso } from "../comun";
import type { Ctx } from "./campana";
import { Campo, Chip, NOMBRE_RESULTADO, Seccion } from "./ui";

const REGLAS = [
  "Cambia una sola cosa entre control y tratamiento (la variable declarada).",
  "Decide el tamaño y la duración antes de lanzar, y no la cortes cuando el resultado te guste.",
  "Espera a que maduren las conversiones (la ventana de atribución) antes de leer.",
  "No declares ganador por la métrica que reporta la red sola: usa tu métrica primaria y mira los guardarraíles.",
  "El resultado vale para esa audiencia, ubicación y fecha; no lo generalices.",
];

function numero(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
}

export function PestanaPrueba({ ctx }: { ctx: Ctx }) {
  const p = ctx.datos.prueba;
  const conceptos = ctx.datos.conceptos;
  const set = <K extends keyof Prueba>(k: K, v: Prueba[K]) => ctx.cambiar((d) => ({ ...d, prueba: { ...d.prueba, [k]: v } }));
  const m = tamanoMuestra({ tasaBase: p.tasaBase, efectoMinimo: p.efectoMinimo, alfa: p.alfa, potencia: p.potencia, tratamientos: p.tratamientos.length || 1, volumenDiario: p.volumenDiario });
  const nombre = (id: string | null) => conceptos.find((c) => c.id === id)?.nombre;

  const noListos = [p.control, ...p.tratamientos]
    .filter((id): id is string => Boolean(id))
    .map((id) => ctx.revision.conceptos.find((r) => r.conceptoId === id))
    .filter((r) => r && (r.resumen.fail > 0 || r.resumen.unknown > 0));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <Seccion titulo="Qué se decide" descripcion="Una prueba sirve para tomar una decisión concreta.">
          <Campo etiqueta="Decisión" ayuda="P. ej.: «Con qué gancho escalamos el presupuesto de diciembre».">
            <input className="campo" value={p.decision} maxLength={400} onChange={(e) => set("decision", e.target.value)} />
          </Campo>
          <Campo etiqueta="Hipótesis" ayuda="Si cambio X, la métrica Y sube porque Z.">
            <textarea className="campo min-h-20" value={p.hipotesis} maxLength={400} onChange={(e) => set("hipotesis", e.target.value)} />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Variable (una sola)">
              <select className="campo" value={p.variable} onChange={(e) => set("variable", e.target.value as Prueba["variable"])}>
                {Object.entries(VARIABLES_PRUEBA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Unidad de aleatorización">
              <select className="campo" value={p.unidad} onChange={(e) => set("unidad", e.target.value as Prueba["unidad"])}>
                {Object.entries(UNIDADES_PRUEBA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
          </div>
        </Seccion>

        <Seccion titulo="Variantes" descripcion="Conceptos de la campaña. Sólo debería cambiar la variable declarada.">
          {conceptos.length < 2 ? (
            <Aviso tipo="info">Hacen falta al menos dos conceptos para una prueba.</Aviso>
          ) : (
            <>
              <Campo etiqueta="Control">
                <select className="campo" value={p.control ?? ""} onChange={(e) => {
                  const v = e.target.value || null;
                  ctx.cambiar((d) => ({ ...d, prueba: { ...d.prueba, control: v, tratamientos: d.prueba.tratamientos.filter((t) => t !== v) } }));
                }}>
                  <option value="">Elige el control…</option>
                  {conceptos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </Campo>
              <div>
                <span className="etiqueta">Tratamientos</span>
                <div className="flex flex-wrap gap-2">
                  {conceptos.filter((c) => c.id !== p.control).map((c) => (
                    <Chip key={c.id} activo={p.tratamientos.includes(c.id)} onClick={() => set("tratamientos", p.tratamientos.includes(c.id) ? p.tratamientos.filter((t) => t !== c.id) : [...p.tratamientos, c.id])}>
                      {c.nombre}
                    </Chip>
                  ))}
                </div>
              </div>
              {noListos.length > 0 && (
                <Aviso tipo="alerta">Sin terminar la revisión: {noListos.map((r) => r!.nombre).join(", ")}. Lanzar con chequeos pendientes mezcla el efecto de la variable con otros problemas.</Aviso>
              )}
            </>
          )}
        </Seccion>

        <Seccion titulo="Cómo se mide">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Métrica primaria" ayuda="P. ej.: tasa de clics, conversiones por visita.">
              <input className="campo" value={p.metrica} maxLength={120} onChange={(e) => set("metrica", e.target.value)} />
            </Campo>
            <Campo etiqueta="Guardarraíles" ayuda="Lo que no puede empeorar: costo por resultado, frecuencia, quejas.">
              <input className="campo" value={p.guardarrailes} maxLength={400} onChange={(e) => set("guardarrailes", e.target.value)} />
            </Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Tasa base del control (%)" ayuda="De tu cuenta, mismo objetivo y ventana.">
              <input className="campo tabular-nums" inputMode="decimal" defaultValue={p.tasaBase ?? ""} onChange={(e) => set("tasaBase", numero(e.target.value))} />
            </Campo>
            <Campo etiqueta="Efecto mínimo relativo (%)" ayuda="La mejora más chica que cambiaría la decisión.">
              <input className="campo tabular-nums" inputMode="decimal" defaultValue={p.efectoMinimo ?? ""} onChange={(e) => set("efectoMinimo", numero(e.target.value))} />
            </Campo>
            <Campo etiqueta="Volumen diario por variante" ayuda="Impresiones o visitas, según la métrica.">
              <input className="campo tabular-nums" inputMode="numeric" defaultValue={p.volumenDiario ?? ""} onChange={(e) => set("volumenDiario", numero(e.target.value))} />
            </Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Significancia (α)">
              <select className="campo" value={p.alfa} onChange={(e) => set("alfa", Number(e.target.value))}>
                {[0.01, 0.05, 0.1].map((a) => <option key={a} value={a}>{(a * 100).toFixed(0)} %</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Potencia (1 − β)">
              <select className="campo" value={p.potencia} onChange={(e) => set("potencia", Number(e.target.value))}>
                {[0.8, 0.9, 0.95].map((a) => <option key={a} value={a}>{(a * 100).toFixed(0)} %</option>)}
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Regla de parada" ayuda="Cuándo se termina y qué resultado lleva a qué decisión.">
            <textarea className="campo min-h-16" value={p.reglaParada} maxLength={400} onChange={(e) => set("reglaParada", e.target.value)} />
          </Campo>
        </Seccion>
        <Resultados ctx={ctx} planeada={m.ok ? m.porVariante : null} />
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <section className="tarjeta p-4" aria-live="polite">
          <h3 className="font-semibold">Tamaño de muestra</h3>
          {m.ok ? (
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-3xl font-bold tabular-nums">{m.porVariante.toLocaleString("es")}</p>
                <p className="text-sm text-tenue">por variante · {m.total.toLocaleString("es")} en total ({(p.tratamientos.length || 1) + 1} variantes)</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-[#0f131a] p-2"><p className="text-xs text-tenue">Control</p><p className="tabular-nums">{(m.p1 * 100).toFixed(2).replace(".", ",")} %</p></div>
                <div className="rounded-lg bg-[#0f131a] p-2"><p className="text-xs text-tenue">A detectar</p><p className="tabular-nums">{(m.p2 * 100).toFixed(2).replace(".", ",")} %</p></div>
              </div>
              <p className="text-sm">{m.dias != null ? <>Duración: <b className="tabular-nums">~{m.dias} día{m.dias === 1 ? "" : "s"}</b></> : <span className="text-tenue">Pon el volumen diario para estimar la duración.</span>}</p>
              {m.avisos.map((a) => <Aviso key={a} tipo="alerta">{a}</Aviso>)}
              <p className="text-xs text-tenue">Aproximación normal para dos proporciones, bilateral. Con varios tratamientos se corrige α (Bonferroni).</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-tenue">Falta {m.falta.join(" y ")}. No se calcula con datos inventados.</p>
          )}
        </section>
        <section className="tarjeta p-4">
          <h3 className="font-semibold">Reglas de la prueba</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-300">{REGLAS.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-acento">•</span>{r}</li>)}</ul>
          {p.control && p.tratamientos.length > 0 && (
            <p className="mt-3 text-sm text-tenue">
              Comparas <b className="text-white">{nombre(p.control)}</b> contra {p.tratamientos.map((t) => nombre(t)).filter(Boolean).join(", ")} cambiando <b className="text-white">{VARIABLES_PRUEBA[p.variable].toLowerCase()}</b>.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

const COLOR_VEREDICTO: Record<Veredicto, string> = {
  gana: "border-emerald-700 bg-emerald-950/40",
  pierde: "border-red-800 bg-red-950/40",
  "sin-diferencia": "border-borde bg-[#0f131a]",
  temprano: "border-amber-700 bg-amber-950/30",
  falta: "border-borde bg-[#0f131a]",
  invalido: "border-red-800 bg-red-950/40",
};

function Resultados({ ctx, planeada }: { ctx: Ctx; planeada: number | null }) {
  const p = ctx.datos.prueba;
  const variantes = [p.control, ...p.tratamientos].filter((x): x is string => Boolean(x));
  const nombres = Object.fromEntries(ctx.datos.conceptos.map((c) => [c.id, c.nombre]));
  const setConteo = (id: string, campo: "unidades" | "conversiones", v: string) =>
    ctx.cambiar((d) => {
      const n = v.trim() === "" ? null : Math.max(0, Math.floor(Number(v.replace(/[.\s]/g, ""))));
      const actual = d.prueba.resultados[id] ?? { unidades: null, conversiones: null };
      return { ...d, prueba: { ...d.prueba, resultados: { ...d.prueba.resultados, [id]: { ...actual, [campo]: Number.isFinite(n) ? n : null } } } };
    });
  if (!p.control || !p.tratamientos.length) {
    return (
      <Seccion titulo="Resultados" descripcion="Cuando la prueba termine, carga aquí los números del administrador.">
        <p className="text-sm text-tenue">Elige primero el control y los tratamientos.</p>
      </Seccion>
    );
  }
  const l = leerPrueba({ control: p.control, tratamientos: p.tratamientos, resultados: p.resultados, alfa: p.alfa, planeada, guardarrailes: p.guardarrailesOk, nombres });
  return (
    <Seccion titulo="Resultados" descripcion="Copia del administrador las unidades (impresiones, visitas…) y las conversiones de la métrica primaria, con la misma ventana para todas.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Inicio"><input type="date" className="campo" value={p.inicio} onChange={(e) => ctx.cambiar((d) => ({ ...d, prueba: { ...d.prueba, inicio: e.target.value } }))} /></Campo>
        <Campo etiqueta="Fin (o último dato)"><input type="date" className="campo" value={p.fin} onChange={(e) => ctx.cambiar((d) => ({ ...d, prueba: { ...d.prueba, fin: e.target.value } }))} /></Campo>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="text-left text-tenue">
              <th className="py-1.5 font-normal">Variante</th>
              <th className="py-1.5 font-normal">Unidades</th>
              <th className="py-1.5 font-normal">Conversiones</th>
              <th className="py-1.5 text-right font-normal">Tasa</th>
            </tr>
          </thead>
          <tbody>
            {variantes.map((id, i) => {
              const r = p.resultados[id];
              const tasa = r?.unidades && r.conversiones != null ? `${((r.conversiones / r.unidades) * 100).toFixed(2).replace(".", ",")} %` : "—";
              return (
                <tr key={id} className="border-t border-borde">
                  <td className="py-1.5 pr-2">{nombres[id] ?? id} <span className="text-xs text-tenue">{i === 0 ? "control" : ""}</span></td>
                  <td className="py-1.5 pr-2"><input className="campo tabular-nums" inputMode="numeric" defaultValue={r?.unidades ?? ""} onChange={(e) => setConteo(id, "unidades", e.target.value)} aria-label={`Unidades de ${nombres[id]}`} /></td>
                  <td className="py-1.5 pr-2"><input className="campo tabular-nums" inputMode="numeric" defaultValue={r?.conversiones ?? ""} onChange={(e) => setConteo(id, "conversiones", e.target.value)} aria-label={`Conversiones de ${nombres[id]}`} /></td>
                  <td className="py-1.5 text-right tabular-nums">{tasa}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <span className="etiqueta">¿Los guardarraíles se mantuvieron?{p.guardarrailes ? ` (${p.guardarrailes})` : ""}</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-borde" role="radiogroup" aria-label="Guardarraíles">
          {(["pass", "fail", "unknown"] as const).map((o) => (
            <button key={o} role="radio" aria-checked={p.guardarrailesOk === o} onClick={() => set("guardarrailesOk", o)}
              className={`px-3 py-1.5 text-xs ${p.guardarrailesOk === o ? "bg-cyan-900 text-white" : "bg-[#0f131a] text-tenue hover:text-white"}`}>
              {o === "pass" ? "Sí" : o === "fail" ? "No" : NOMBRE_RESULTADO.unknown}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2" aria-live="polite">
        <p className="rounded-lg border border-cyan-900 bg-cyan-950/30 p-3 font-medium">{l.decision}</p>
        {l.comparaciones.map((c) => (
          <p key={c.tratamiento} className={`rounded-lg border p-2.5 text-sm ${COLOR_VEREDICTO[c.veredicto]}`}>{c.texto}</p>
        ))}
        {l.avisos.map((a) => <Aviso key={a} tipo="alerta">{a}</Aviso>)}
        <p className="text-xs text-tenue">Prueba z de dos proporciones, bilateral, α = {(l.alfaCorregido * 100).toFixed(2).replace(".", ",")} % por comparación. El intervalo usa el mismo α.</p>
      </div>
    </Seccion>
  );

  function set<K extends keyof Prueba>(k: K, v: Prueba[K]) {
    ctx.cambiar((d) => ({ ...d, prueba: { ...d.prueba, [k]: v } }));
  }
}
