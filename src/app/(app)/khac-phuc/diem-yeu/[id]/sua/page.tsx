import DeficiencyFormScreen from "@/screens/KhacPhuc/DeficiencyForm";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DeficiencyFormScreen mode="edit" code={decodeURIComponent(id)} />;
}
