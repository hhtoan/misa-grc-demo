import ControlFormScreen from "@/screens/KiemSoat/ControlForm";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ControlFormScreen mode="edit" code={decodeURIComponent(id)} />;
}
