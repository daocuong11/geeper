import { describe, expect, it } from "vitest";
import { segmentosVisuales } from "@/lib/compilador";
import { pista, validarProyecto } from "@/lib/esquema";
import { ENTRADA, escenasEnLinea } from "@/lib/linea";
import { LORA_HABLAR } from "@/lib/presentador";
import {
  ajustesRehacer, argsTramo, clipNuevo, CUADROS_CAMARA, cuadros4k1, FPS_PERSONA, MAX_CAMARA, MAX_PERSONA, MODELO_CAMARA, MODELO_PERSONA, PedidoRehacer, planearRehacer, SEGUNDOS_CAMARA, tramoDeEscena,
} from "@/lib/rehacer";
import { proyectoDePrueba } from "./fixtures";

const persona = PedidoRehacer.parse({ tipo: "persona", avatar: "sofia-1a2b" });
const camara = PedidoRehacer.parse({ tipo: "camara", movimiento: 5 });

/** El fixture con la escena 2 como un clip de directo: el video sigue a la voz (misma grabación). */
function conSincro() {
  const p = proyectoDePrueba();
  p.assets.vod = { id: "vod", tipo: "video", ruta: "assets/vod.mp4", hash: "c".repeat(64), source: "archivo", licencia: "propia", duracion: 60, ancho: 1920, alto: 1080, regenerar: {} };
  const c = pista(p, "visual").clips[1]!;
  c.asset = "vod";
  c.rango = { inicio: 20, duracion: 3 };
  c.sincro = "voz";
  return validarProyecto(p);
}

describe("rehacer la toma: qué parte del video", () => {
  it("normal: desde donde empieza el clip, lo que dura en pantalla (la primera escena suma la entrada)", () => {
    const es = escenasEnLinea(proyectoDePrueba());
    expect(tramoDeEscena(es[1]!, 6)).toEqual({ desde: 0, hasta: 3, velocidad: 1, sincro: false, inicioNuevo: 0, largo: 3 });
    const t0 = tramoDeEscena(es[0]!, 6);
    expect(t0.hasta).toBeCloseTo(3 + ENTRADA);
  });

  it("con velocidad: se recorta más del original y el video nuevo va a velocidad 1", () => {
    const p = proyectoDePrueba();
    pista(p, "visual").clips[1]!.velocidad = 0.5;
    const t = tramoDeEscena(escenasEnLinea(p)[1]!, 6);
    expect(t).toMatchObject({ desde: 0, hasta: 1.5, velocidad: 0.5, largo: 3 });
  });

  it("sincro con la voz: el mismo tramo de la grabación que la voz y el desplazamiento para seguirla", () => {
    const es = escenasEnLinea(conSincro())[1]!;
    expect(tramoDeEscena(es, 60)).toEqual({ desde: 20, hasta: 23, velocidad: 1, sincro: true, inicioNuevo: 0, largo: 3 });
  });

  it("no se pasa del final del video original", () => {
    const es = escenasEnLinea(proyectoDePrueba())[1]!;
    expect(tramoDeEscena(es, 2).hasta).toBe(2);
  });
});

describe("rehacer la toma: plan", () => {
  it("persona: cuadros 4k+1 a 30 fps que cubren toda la escena (si no, se vería un salto al final)", () => {
    const plan = planearRehacer(proyectoDePrueba(), "e02", persona);
    expect(plan.cuadros).toBe(cuadros4k1(3, FPS_PERSONA));
    expect((plan.cuadros - 1) % 4).toBe(0);
    expect((plan.cuadros - 1) / FPS_PERSONA).toBeGreaterThanOrEqual(3 - 1e-9);
    for (const s of [5, 4.97, 0.6, 14.9]) expect((cuadros4k1(s, 30) - 1) / 30).toBeGreaterThanOrEqual(s - 1 / 30);
    expect(cuadros4k1(81 / 16 - 1 / 16, 16)).toBe(81);
  });

  it("persona en un clip que sigue a la voz: avisa que la boca no se desincroniza", () => {
    const plan = planearRehacer(conSincro(), "e02", persona);
    expect(plan.tramo.sincro).toBe(true);
    expect(plan.notas.join(" ")).toMatch(/boca no se desincroniza/);
  });

  it("cámara: 81 cuadros; una escena más larga que 5 s entra acelerada y se pasa más lenta", () => {
    expect(planearRehacer(proyectoDePrueba(), "e02", camara)).toMatchObject({ cuadros: CUADROS_CAMARA, velocidadFinal: null });
    const p = proyectoDePrueba();
    pista(p, "visual").clips[1]!.rango.duracion = 3;
    p.assets["clip-02"]!.duracion = 20;
    pista(p, "voz").clips[1]!.rango.duracion = 3;
    // Alarga la escena 2 a 7 s en la voz (el visual la cubre).
    const largo = validarProyecto({ ...p, assets: { ...p.assets, voz: { ...p.assets.voz!, duracion: 20 } } });
    pista(largo, "voz").clips[1]!.rango.duracion = 7;
    const plan = planearRehacer(validarProyecto(largo), "e02", camara);
    expect(plan.velocidadFinal).toBeCloseTo(SEGUNDOS_CAMARA / 7, 3);
  });

  it("errores en palabras simples: sin video, demasiado larga, cámara sobre un clip que sigue a la voz", () => {
    const img = proyectoDePrueba();
    img.assets["clip-02"] = { ...img.assets["clip-02"]!, tipo: "imagen", ruta: "assets/clip-02.png", duracion: undefined };
    expect(() => planearRehacer(validarProyecto(img), "e02", persona)).toThrow(/no tiene video/);
    expect(() => planearRehacer(conSincro(), "e02", camara)).toThrow(/la boca deja de coincidir/);
    const largo = proyectoDePrueba();
    largo.assets.voz!.duracion = 60;
    largo.assets["clip-02"]!.duracion = 60;
    pista(largo, "voz").clips[1]!.rango.duracion = MAX_PERSONA + 2;
    expect(() => planearRehacer(validarProyecto(largo), "e02", persona)).toThrow(/divídela o acórtala/);
    expect(() => planearRehacer(validarProyecto(largo), "e02", camara)).toThrow(new RegExp(`hasta ${MAX_CAMARA.toFixed(0)} s`));
  });
});

describe("rehacer la toma: ajustes de Wan2GP y ffmpeg", () => {
  it("persona: Wan2.2 Animate «Replace Person» con reiluminación, el avatar como referencia y 4 pasos", () => {
    const plan = planearRehacer(proyectoDePrueba(), "e02", persona);
    const a = ajustesRehacer(plan, "9:16", "/c/toma.mp4", "/c/retrato.png", "a man talking");
    expect(a).toMatchObject({ model_type: MODELO_PERSONA, video_prompt_type: "PVBAIH#1", video_guide: "/c/toma.mp4", image_refs: ["/c/retrato.png"], force_fps: "control", resolution: "480x832", activated_loras: [LORA_HABLAR], num_inference_steps: 4, audio_prompt_type: "" });
    const sinLuz = ajustesRehacer(planearRehacer(proyectoDePrueba(), "e02", PedidoRehacer.parse({ tipo: "persona", avatar: "sofia-1a2b", reiluminar: false })), "16:9", "/v", "/r", "");
    expect(sinLuz).toMatchObject({ video_prompt_type: "PVBAIH#", resolution: "832x480", prompt: "The person moves naturally." });
  });

  it("cámara: ReCamMaster con el movimiento elegido y 81 cuadros", () => {
    const a = ajustesRehacer(planearRehacer(proyectoDePrueba(), "e02", camara), "1:1", "/c/toma.mp4", null, "a lighthouse");
    expect(a).toMatchObject({ model_type: MODELO_CAMARA, model_mode: 5, video_prompt_type: "UV", video_length: 81, resolution: "640x640" });
  });

  it("ffmpeg: recorta el tramo sin audio; la cámara rellena hasta 81 cuadros o acelera la escena larga", () => {
    const plan = planearRehacer(proyectoDePrueba(), "e02", camara);
    const args = argsTramo("in.mp4", "out.mp4", plan);
    expect(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 4)).toEqual(["-ss", "0.000", "-t", "3.000"]);
    expect(args).toContain("-an");
    expect(args[args.indexOf("-vf") + 1]).toBe("fps=16,tpad=stop_mode=clone:stop=81");
    expect(args[args.indexOf("-frames:v") + 1]).toBe("81");
    const rapido = argsTramo("in.mp4", "out.mp4", { ...plan, velocidadFinal: 0.5 });
    expect(rapido[rapido.indexOf("-vf") + 1]).toMatch(/^setpts=PTS\/2,fps=16/);
    const per = argsTramo("in.mp4", "out.mp4", planearRehacer(proyectoDePrueba(), "e02", persona));
    expect(per[per.indexOf("-vf") + 1]).toBe(`fps=30,tpad=stop_mode=clone:stop=${cuadros4k1(3, 30)}`);
  });
});

describe("rehacer la toma: el clip nuevo", () => {
  it("sigue a la voz igual que el original (los recortes de palabras siguen cortando la imagen)", () => {
    const p = conSincro();
    const plan = planearRehacer(p, "e02", persona);
    const viejo = pista(p, "visual").clips[1]!;
    const c = clipNuevo(viejo, plan, "persona-abc");
    expect(c).toMatchObject({ id: viejo.id, asset: "persona-abc", sincro: "voz", rango: { inicio: 0, duracion: 3 } });
    // Al compilar, cada tramo de voz toma la misma parte del video nuevo que tomaba del viejo (corrida 20 s).
    const q = structuredClone(p);
    q.assets["persona-abc"] = { ...p.assets.vod!, id: "persona-abc", duracion: 3 };
    pista(q, "visual").clips[1] = c;
    const es = escenasEnLinea(validarProyecto(q))[1]!;
    const nuevos = segmentosVisuales(es, q.assets["persona-abc"]!, 1, 0);
    const viejos = segmentosVisuales(escenasEnLinea(p)[1]!, p.assets.vod!, 1, 0);
    expect(nuevos.map((s) => s.desde + 20)).toEqual(viejos.map((s) => s.desde));
  });

  it("cámara: sin sincro, desde 0 y con la velocidad para llenar la escena", () => {
    const p = proyectoDePrueba();
    const plan = { ...planearRehacer(p, "e02", camara), velocidadFinal: 0.8 };
    const c = clipNuevo({ ...pista(p, "visual").clips[1]!, velocidad: 2 }, plan, "camara-x");
    expect(c).toMatchObject({ asset: "camara-x", rango: { inicio: 0, duracion: 3 }, velocidad: 0.8 });
    expect(c.sincro).toBeUndefined();
  });
});
