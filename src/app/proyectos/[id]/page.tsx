import { EditorProyecto } from "@/components/editor-proyecto";

export default async function Proyecto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorProyecto id={id} />;
}
