import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/ui";
import { findItemByPath } from "@/config/navigation";
import { PageBody, PageContainer, PageHeader } from "@/components/layout";

export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const pathname = "/" + (slug ?? []).join("/");
  const found = findItemByPath(pathname);

  // Đường dẫn không nằm trong cây menu -> 404 thật
  if (!found) notFound();

  return (
    <PageContainer>
      <PageHeader title={found.item.label} />
      <PageBody className="flex flex-col">
        <ComingSoon moduleName={found.item.label} />
      </PageBody>
    </PageContainer>
  );
}
