import { getExplorationRun } from "@/lib/actions/exploration";
import { notFound } from "next/navigation";
import ExplorationDetailClient from "@/components/ExplorationDetailClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExplorationDetailPage({ params }: Props) {
  const { id } = await params;
  const run = await getExplorationRun(id);

  if (!run) {
    notFound();
  }

  return <ExplorationDetailClient run={run} />;
}
