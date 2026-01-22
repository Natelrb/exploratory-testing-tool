import { getSession } from "@/lib/actions/sessions";
import { notFound, redirect } from "next/navigation";
import LiveSessionView from "@/components/LiveSessionView";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SessionPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    notFound();
  }

  // If session is completed, redirect to debrief
  if (session.status === "completed") {
    redirect(`/debrief/${session.id}`);
  }

  return <LiveSessionView session={session} />;
}
