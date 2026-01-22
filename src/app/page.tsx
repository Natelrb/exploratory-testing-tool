import { getProductAreas } from "@/lib/actions/product-areas";
import { getBuilds } from "@/lib/actions/builds";
import { getCharterTemplates } from "@/lib/actions/charters";
import { getActiveSession } from "@/lib/actions/sessions";
import StartSessionForm from "@/components/StartSessionForm";
import Link from "next/link";

export default async function Home() {
  const [productAreas, builds, charterTemplates, activeSession] = await Promise.all([
    getProductAreas(),
    getBuilds(),
    getCharterTemplates(),
    getActiveSession(),
  ]);

  // If there's an active session, redirect to it
  if (activeSession) {
    return (
      <div className="space-y-6">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <h2 className="text-lg font-medium text-yellow-800 dark:text-yellow-200">
            Session in Progress
          </h2>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
            You have an active session: &quot;{activeSession.charter.mission}&quot;
          </p>
          <div className="mt-3 flex gap-3">
            <Link
              href={`/session/${activeSession.id}`}
              className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700"
            >
              Continue Session
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Start New Session
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Set up your exploratory testing session
        </p>
      </div>

      <StartSessionForm
        productAreas={productAreas}
        builds={builds}
        charterTemplates={charterTemplates}
      />
    </div>
  );
}
