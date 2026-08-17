import EventFormScreen from "@/screens/SuKien/EventForm";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventFormScreen mode="edit" code={decodeURIComponent(id)} />;
}
