import KppnFormScreen from "@/screens/KhacPhuc/KppnForm";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KppnFormScreen mode="edit" code={decodeURIComponent(id)} />;
}
