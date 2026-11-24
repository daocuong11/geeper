import { notFound } from "next/navigation";
import { AppCraftAbierta } from "@/components/media";
import { appCraft, versionWeb } from "@/lib/craft-web";

export const dynamic = "force-dynamic";

export default async function Pagina({ params }: { params: Promise<{ app: string }> }) {
  const a = appCraft((await params).app);
  if (!a) notFound();
  return <AppCraftAbierta app={a.app} nombre={a.nombre} version={await versionWeb(a.app)} />;
}
