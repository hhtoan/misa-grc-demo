import KppnFormScreen from "@/screens/KhacPhuc/KppnForm";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    deficiency?: string;
    risk?: string;
    event?: string;
  }>;
}) {
  const sp = await searchParams;
  return (
    <KppnFormScreen
      mode="create"
      preset={{
        deficiency: sp.deficiency,
        risk: sp.risk,
        event: sp.event,
      }}
    />
  );
}
