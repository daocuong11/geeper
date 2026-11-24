"use client";
/**
 * «Personalizar el setup» de «Nuevo»: parte del preset elegido y deja cambiar el modelo (workflow), la
 * fluidez, la cámara (cámara, lente, focal, apertura, movimiento, luz, look), el desenfoque de movimiento
 * y el acabado (grano, viñeta). La lógica está en setup-video.ts; aquí sólo se elige.
 */
import { NOMBRES } from "@/lib/prompt-camara";
import { GRANOS, MODELOS_VIDEO, mismoSetup, pasosSetup, type ModeloVideo, type SetupVideo } from "@/lib/setup-video";

type CampoCamara = keyof SetupVideo["camara"];

/** Lo que se muestra de la cámara, en el orden de un rodaje. */
const CAMPOS: { campo: CampoCamara; nombre: string }[] = [
  { campo: "camara", nombre: "Cámara" },
  { campo: "lente", nombre: "Lente" },
  { campo: "focal", nombre: "Focal" },
  { campo: "apertura", nombre: "Apertura" },
  { campo: "movimiento", nombre: "Movimiento" },
  { campo: "plano", nombre: "Plano" },
  { campo: "luz", nombre: "Luz" },
  { campo: "look", nombre: "Color" },
];

export function PanelSetup({ setup, preset, nombrePreset, conAvatar, alCambiar }: {
  setup: SetupVideo;
  preset: SetupVideo;
  nombrePreset: string;
  conAvatar: boolean;
  alCambiar: (s: SetupVideo) => void;
}) {
  const personalizado = !mismoSetup(setup, preset);
  const anima = MODELOS_VIDEO[setup.modelo].plano !== null;
  const video = !conAvatar; // con avatar, las escenas las hace InfiniteTalk: sólo cuenta el acabado
  const cambiar = (c: Partial<SetupVideo>) => alCambiar({ ...setup, ...c });
  const cambiarCamara = (campo: CampoCamara, v: string) =>
    cambiar({ camara: { ...setup.camara, [campo]: v === "" ? undefined : campo === "focal" ? Number(v) : v } });

  return (
    <details className="tarjeta p-3" open={personalizado || undefined}>
      <summary className="cursor-pointer text-sm">
        Personalizar el setup (modelo, cámara, acabado)
        <span className="ml-2 text-xs text-tenue">{personalizado ? `«${nombrePreset}», personalizado` : `igual que «${nombrePreset}»`}</span>
      </summary>
      <div className="mt-3 space-y-4 text-sm">
        {conAvatar && <p className="text-xs text-tenue">Con tu avatar de protagonista, cada escena la hace InfiniteTalk: aquí sólo cuenta el acabado (grano y viñeta).</p>}

        <fieldset className="space-y-2" disabled={!video}>
          <legend className="etiqueta">Video: qué modelo anima cada escena</legend>
          <select className="campo" value={setup.modelo} onChange={(e) => cambiar({ modelo: e.target.value as ModeloVideo })} aria-label="Modelo de video">
            {Object.entries(MODELOS_VIDEO).map(([id, m]) => (
              <option key={id} value={id}>{m.nombre}{m.minutos ? ` · ${m.medido ? "" : "~"}${m.minutos} min por escena` : ""}</option>
            ))}
          </select>
          <label className={`flex items-center gap-2 ${MODELOS_VIDEO[setup.modelo].fps === 16 ? "" : "opacity-50"}`}>
            <input type="checkbox" checked={setup.fluidez} disabled={MODELOS_VIDEO[setup.modelo].fps !== 16} onChange={(e) => cambiar({ fluidez: e.target.checked })} />
            Más fluido: RIFE a 32 cuadros por segundo {MODELOS_VIDEO[setup.modelo].fps !== 16 && <span className="text-xs text-tenue">(sólo el I2V 14B, que sale a 16)</span>}
          </label>
        </fieldset>

        <fieldset className="space-y-2" disabled={!video || !anima}>
          <legend className="etiqueta">Cámara {(!anima || !video) && <span className="font-normal text-tenue">(sólo cuando cada escena pasa a video)</span>}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CAMPOS.map(({ campo, nombre }) => (
              <label key={campo} className="block">
                <span className="text-xs text-tenue">{nombre}</span>
                <select className="campo" value={setup.camara[campo] === undefined ? "" : String(setup.camara[campo])} onChange={(e) => cambiarCamara(campo, e.target.value)}>
                  <option value="">Que decida el modelo</option>
                  {Object.entries(NOMBRES[campo] as Record<string, string>).map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
                </select>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={setup.desenfoqueMovimiento} onChange={(e) => cambiar({ desenfoqueMovimiento: e.target.checked })} />
            Desenfoque de movimiento (obturador de 180°, como una cámara de cine)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={setup.realista} onChange={(e) => cambiar({ realista: e.target.checked })} />
            Que parezca filmado (piel con textura, luz imperfecta, nada de aspecto IA)
          </label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="etiqueta">Acabado (en todo el video)</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Grano">
            {Object.entries(GRANOS).map(([id, g]) => (
              <button key={id} type="button" role="radio" aria-checked={setup.grano === id} onClick={() => cambiar({ grano: id as SetupVideo["grano"] })}
                className={`boton ${setup.grano === id ? "boton-primario" : ""}`}>{g.nombre}</button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={setup.vineta} onChange={(e) => cambiar({ vineta: e.target.checked })} />
            Viñeta suave (bordes un poco más oscuros)
          </label>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 border-t border-borde pt-2 text-xs">
          <span className="text-tenue">Queda así:</span>
          {pasosSetup(conAvatar ? { ...setup, modelo: "zoom", desenfoqueMovimiento: false } : setup)
            .filter((x) => !conAvatar || x.paso === "Acabado")
            .map((x) => <span key={x.paso} className="rounded bg-white/5 px-1.5 py-0.5"><span className="text-tenue">{x.paso}:</span> {x.workflow}</span>)}
          {personalizado && <button type="button" className="boton ml-auto" onClick={() => alCambiar(preset)}>Volver a «{nombrePreset}»</button>}
        </div>
      </div>
    </details>
  );
}
