import { Suspense } from "react";
import { PaginaClips } from "@/components/clips";

export default function Clips() {
  return (
    <Suspense fallback={<p className="text-tenue">Cargando…</p>}>
      <PaginaClips />
    </Suspense>
  );
}
