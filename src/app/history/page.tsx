import { getSessions } from "@/lib/actions/sessions";
import { getProductAreas } from "@/lib/actions/product-areas";
import { getBuilds } from "@/lib/actions/builds";
import SessionHistoryList from "@/components/SessionHistoryList";

interface Props {
  searchParams: Promise<{
    productArea?: string;
    build?: string;
    tester?: string;
  }>;
}

export default async function HistoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const [sessions, productAreas, builds] = await Promise.all([
    getSessions({
      productAreaId: params.productArea,
      buildId: params.build,
      testerName: params.tester,
    }),
    getProductAreas(),
    getBuilds(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Session History
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Review past exploratory testing sessions
        </p>
      </div>

      <SessionHistoryList
        sessions={sessions}
        productAreas={productAreas}
        builds={builds}
        currentFilters={{
          productArea: params.productArea,
          build: params.build,
          tester: params.tester,
        }}
      />
    </div>
  );
}
