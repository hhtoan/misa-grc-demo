import DiemYeuChiTietScreen from "@/screens/KhacPhuc/DiemYeuChiTiet";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DiemYeuChiTietScreen code={decodeURIComponent(id)} />;
}
