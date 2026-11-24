/** Formatos vectoriales que VectorCraft convierte a SVG al subirlos. Sin dependencias: se usa también en el navegador. */
export const EXT_VECTOR = [".ai", ".ait", ".pdf", ".eps", ".epsf", ".ps", ".af", ".afdesign", ".afpub", ".dxf", ".emf", ".wmf", ".svgz"] as const;

export const esVector = (nombre: string) => {
  const i = nombre.lastIndexOf(".");
  return i >= 0 && (EXT_VECTOR as readonly string[]).includes(nombre.slice(i).toLowerCase());
};

/** Para `accept` de un selector de imágenes: imágenes, SVG y los formatos vectoriales. */
export const ACCEPT_IMAGEN = ["image/*", ".svg", ...EXT_VECTOR].join(",");
