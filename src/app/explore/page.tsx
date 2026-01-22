import { getExplorationRuns } from "@/lib/actions/exploration";
import ExplorePageClient from "@/components/ExplorePageClient";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const runs = await getExplorationRuns();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          AI Explorer
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Automated exploratory testing powered by AI
        </p>
      </div>

      <ExplorePageClient initialRuns={runs} />
    </div>
  );
}
