import RiskFormScreen from "@/screens/RuiRo/RiskForm";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RiskFormScreen mode="edit" code={decodeURIComponent(id)} />;
}
