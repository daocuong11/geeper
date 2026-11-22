import { describe, expect, it } from "vitest";
import { pista, validarProyecto, type Proyecto } from "@/lib/esquema";
import { conRecortes, hablaConSuVoz, minutosProtagonista, PISTA_RECORTES, segundosDeTomas, tomasProtagonista } from "@/lib/protagonista";
import { MAX_SEGUNDOS } from "@/lib/presentador";
import { proyectoDePrueba } from "./fixtures";

/** Las escenas con `segundos` de voz cada una. */
function conVoz(segundos: number[]): Proyecto {
  const p = proyectoDePrueba();
  const voz = pista(p, "voz").clips;
  let t = 0;
  segundos.forEach((s, i) => {
    voz[i]!.rango = { inicio: t, duracion: s };
    pista(p, "visual").clips[i]!.rango = { inicio: 0, duracion: s };
    t += s;
  });
  p.assets.voz!.duracion = t;
  for (const id of ["clip-01", "clip-02", "clip-03"]) p.assets[id]!.duracion = Math.max(...segundos) + 1;
  return validarProyecto(p);
}

describe("protagonista: un solo set, de corrido", () => {
  it("un short entra en una sola toma; uno largo se parte en tomas de escenas seguidas", () => {
    expect(tomasProtagonista(proyectoDePrueba())).toEqual([["e01", "e02", "e03"]]);
    const largo = conVoz([50, 50, 50]);
    expect(tomasProtagonista(largo)).toEqual([["e01", "e02"], ["e03"]]);
    expect(segundosDeTomas(largo).every((s) => s <= MAX_SEGUNDOS)).toBe(true);
  });

  it("una escena que no entra en una toma se avisa (hay que partirla)", () => {
    expect(() => tomasProtagonista(conVoz([MAX_SEGUNDOS, 3, 3]))).toThrow(/escena 1.*pártela/);
  });

  it("lo que tarda: ~7 min por toma más la voz; de cuerpo completo, el doble", () => {
    expect(minutosProtagonista([60], "medio")).toBe(28);
    expect(minutosProtagonista([60], "completo")).toBeGreaterThan(50);
  });

  it("la voz del avatar: Kokoro de MPT lleva «kokoro:» delante; VoxCPM tiene que ser la misma", () => {
    const voz = { motor: "mpt" as const, voz: "kokoro:ef_dora", velocidad: 1, idioma: "es" };
    expect(hablaConSuVoz(voz, { motor: "kokoro", voz: "ef_dora", nombre: "Dora" })).toBe(true);
    expect(hablaConSuVoz(voz, { motor: "kokoro", voz: "af_heart", nombre: "Heart" })).toBe(false);
    expect(hablaConSuVoz(voz, { motor: "voxcpm", voz: "sofia", nombre: "Sofía" })).toBe(false);
  });

  it("las imágenes del tema quedan en una ventana encima, menos en el gancho y donde no entró el avatar", () => {
    const original = proyectoDePrueba();
    const p = structuredClone(original);
    // El avatar entró en las escenas 1 y 2 (como deja aplicarPresentador: los clips viejos ya no están).
    p.assets.avatar = { ...p.assets["clip-01"]!, id: "avatar", ruta: "assets/avatar.mp4", source: "wan", duracion: 8 };
    pista(p, "visual").clips[0]!.asset = "avatar";
    pista(p, "visual").clips[1]!.asset = "avatar";
    delete p.assets["clip-01"];
    delete p.assets["clip-02"];
    const r = conRecortes(validarProyecto(p), original);
    const recortes = r.pistas.find((x) => x.id === PISTA_RECORTES)!;
    expect(recortes.clips.map((c) => [c.asset, c.inicio, c.marco?.esquina])).toEqual([["clip-02", expect.any(Number), "auto"]]);
    expect(r.assets["clip-02"]).toBeDefined();
    // Ponerlo otra vez: la ventana sigue con la imagen del tema, no con el avatar anterior.
    const otraVez = structuredClone(r);
    otraVez.assets.avatar2 = { ...otraVez.assets.avatar!, id: "avatar2", ruta: "assets/avatar2.mp4" };
    pista(otraVez, "visual").clips[1]!.asset = "avatar2";
    const r2 = conRecortes(validarProyecto(otraVez), r);
    expect(r2.pistas.filter((x) => x.id === PISTA_RECORTES)).toHaveLength(1);
    expect(r2.pistas.find((x) => x.id === PISTA_RECORTES)!.clips.map((c) => c.asset)).toEqual(["clip-02"]);
  });
});
