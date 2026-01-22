"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Session, Charter, ProductArea, Build, Note } from "@/generated/prisma/client";

type SessionWithRelations = Session & {
  charter: Charter & { productArea: ProductArea | null };
  build: Build | null;
  notes: Note[];
};

interface Props {
  sessions: SessionWithRelations[];
  productAreas: ProductArea[];
  builds: Build[];
  currentFilters: {
    productArea?: string;
    build?: string;
    tester?: string;
  };
}

export default function SessionHistoryList({
  sessions,
  productAreas,
  builds,
  currentFilters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/history?${params.toString()}`);
  };

  // Get unique testers from sessions
  const testers = Array.from(new Set(sessions.map((s) => s.testerName))).sort();

  // Group sessions by date
  const sessionsByDate = sessions.reduce<Record<string, SessionWithRelations[]>>(
    (acc, session) => {
      const date = new Date(session.startTime).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(session);
      return acc;
    },
    {}
  );

  const countNotesByType = (notes: Note[]) => {
    const counts: Record<string, number> = {};
    notes.forEach((note) => {
      counts[note.type] = (counts[note.type] || 0) + 1;
    });
    return counts;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Product Area
            </label>
            <select
              value={currentFilters.productArea || ""}
              onChange={(e) => updateFilter("productArea", e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">All areas</option>
              {productAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Build
            </label>
            <select
              value={currentFilters.build || ""}
              onChange={(e) => updateFilter("build", e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">All builds</option>
              {builds.map((build) => (
                <option key={build.id} value={build.id}>
                  {build.version} ({build.environment})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Tester
            </label>
            <select
              value={currentFilters.tester || ""}
              onChange={(e) => updateFilter("tester", e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">All testers</option>
              {testers.map((tester) => (
                <option key={tester} value={tester}>
                  {tester}
                </option>
              ))}
            </select>
          </div>
          {(currentFilters.productArea || currentFilters.build || currentFilters.tester) && (
            <div className="flex items-end">
              <button
                onClick={() => router.push("/history")}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Session list */}
      {sessions.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No sessions found. Start your first exploratory testing session!
          </p>
          <Link
            href="/"
            className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
          >
            Start New Session
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(sessionsByDate).map(([date, dateSessions]) => (
            <div key={date}>
              <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                {date}
              </h2>
              <div className="space-y-3">
                {dateSessions.map((session) => {
                  const noteCounts = countNotesByType(session.notes);
                  const duration = session.endTime
                    ? Math.round(
                        (new Date(session.endTime).getTime() -
                          new Date(session.startTime).getTime()) /
                          60000
                      )
                    : null;

                  return (
                    <Link
                      key={session.id}
                      href={
                        session.status === "active"
                          ? `/session/${session.id}`
                          : `/debrief/${session.id}`
                      }
                      className="block bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-medium ${
                                session.status === "active"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                  : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                              }`}
                            >
                              {session.status === "active" ? "Active" : "Completed"}
                            </span>
                            {session.charter.productArea && (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                                {session.charter.productArea.name}
                              </span>
                            )}
                          </div>
                          <h3 className="font-medium text-gray-900 dark:text-white truncate">
                            {session.charter.mission}
                          </h3>
                          <div className="flex gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                            <span>{session.testerName}</span>
                            <span>
                              {new Date(session.startTime).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {duration && <span>{duration} min</span>}
                          </div>
                        </div>
                        <div className="ml-4 flex flex-wrap gap-1 justify-end max-w-[120px]">
                          {noteCounts.bug && (
                            <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded">
                              {noteCounts.bug} bug{noteCounts.bug > 1 ? "s" : ""}
                            </span>
                          )}
                          {noteCounts.risk && (
                            <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 rounded">
                              {noteCounts.risk} risk{noteCounts.risk > 1 ? "s" : ""}
                            </span>
                          )}
                          {session.notes.length > 0 && (
                            <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded">
                              {session.notes.length} note{session.notes.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
