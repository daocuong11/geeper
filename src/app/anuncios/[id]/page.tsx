import { Campana } from "@/components/anuncios/campana";

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // key: al pasar de una campaña a otra (p. ej. al duplicar) se monta de cero, sin autoguardados viejos.
  return <Campana key={id} id={id} />;
}
