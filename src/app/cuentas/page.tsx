import { Cuentas } from "@/components/cuentas";

export const dynamic = "force-dynamic";

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function Pagina({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  return <Cuentas ok={uno(q.ok)} error={uno(q.error)} aviso={uno(q.aviso)} />;
}
