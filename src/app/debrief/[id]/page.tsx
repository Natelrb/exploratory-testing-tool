import { getSession } from "@/lib/actions/sessions";
import { notFound } from "next/navigation";
import DebriefView from "@/components/DebriefView";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DebriefPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    notFound();
  }

  return <DebriefView session={session} />;
}
