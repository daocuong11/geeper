import { validarProyecto, type Proyecto } from "@/lib/esquema";

const h = "a".repeat(64);
export function proyectoDePrueba(): Proyecto {
  const escenas: Proyecto["escenas"] = {};
  const voz = [];
  const visual = [];
  for (let i = 0; i < 3; i++) {
    const id = `e0${i + 1}`;
    const base = i * 3;
    escenas[id] = {
      id,
      texto: `Escena ${i + 1} dice GTA seis.`,
      palabras: ["Escena", `${i + 1}`, "dice", "GTA", "seis."].map((t, k) => ({ texto: t, inicio: base + k * 0.5, fin: base + k * 0.5 + 0.4 })),
      correcciones: [],
    };
    voz.push({ id: `voz-${id}`, asset: "voz", escena: id, rango: { inicio: base, duracion: 3 } });
    visual.push({ id: `vis-${id}`, asset: `clip-0${i + 1}`, escena: id, rango: { inicio: 0, duracion: 3 } });
  }
  return validarProyecto({
    schemaVersion: 1, id: "p1", nombre: "Prueba", tema: "t", formato: "9:16", plantilla: "gta-vi-shorts", fps: 30,
    voz: { motor: "kokoro", voz: "ef_dora", velocidad: 1, idioma: "es" },
    guion: { texto: Object.values(escenas).map((e) => e.texto).join(" ") },
    mostrar: [{ de: "GTA seis", a: "GTA VI" }],
    assets: {
      voz: { id: "voz", tipo: "audio", ruta: "assets/voz.mp3", hash: h, source: "mpt", licencia: "x", duracion: 9, regenerar: {} },
      ...Object.fromEntries([1, 2, 3].map((i) => [`clip-0${i}`, { id: `clip-0${i}`, tipo: "video", ruta: `assets/clip-0${i}.mp4`, hash: h, source: "mpt", licencia: "x", duracion: 6, ancho: 1080, alto: 1920, regenerar: {} }])),
    },
    pistas: [
      { id: "visual", tipo: "video", clips: visual },
      { id: "voz", tipo: "audio", clips: voz },
    ],
    escenas,
    marcadores: [],
    origen: {},
  });
}
