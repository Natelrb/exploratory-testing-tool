"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type {
  ExplorationRun,
  ExplorationAction,
  ExplorationFinding,
  ExplorationEvidence,
  ExplorationLog,
  Session,
  Charter,
} from "@/generated/prisma/client";

type RunWithRelations = ExplorationRun & {
  actions: ExplorationAction[];
  findings: ExplorationFinding[];
  evidence: ExplorationEvidence[];
  logs: ExplorationLog[];
  session: (Session & { charter: Charter }) | null;
};

interface Props {
  run: RunWithRelations;
}

export default function ExplorationDetailClient({ run: initialRun }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [run, setRun] = useState(initialRun);
  const [activeTab, setActiveTab] = useState<"actions" | "findings" | "evidence" | "logs">(
    "actions"
  );
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  // Poll for updates if running
  useEffect(() => {
    if (run.status !== "running" && run.status !== "pending") return;

    const interval = setInterval(() => {
      router.refresh();
    }, 2000);

    return () => clearInterval(interval);
  }, [run.status, router]);

  // Update run when initialRun changes
  useEffect(() => {
    setRun(initialRun);
  }, [initialRun]);

  const handleStart = async () => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/explore/${run.id}/start`, {
          method: "POST",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to start exploration");
        }

        router.refresh();
      } catch (error) {
        console.error("Failed to start:", error);
        alert(error instanceof Error ? error.message : "Failed to start exploration");
      }
    });
  };

  const handleStop = () => {
    setShowStopConfirm(true);
  };

  const handleStopConfirm = async () => {
    setShowStopConfirm(false);
    setIsStopping(true);
    try {
      const response = await fetch(`/api/explore/${run.id}/stop`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to stop exploration");
      }

      router.refresh();
    } catch (error) {
      console.error("Failed to stop:", error);
      alert(error instanceof Error ? error.message : "Failed to stop exploration");
    } finally {
      setIsStopping(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
      running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      skipped: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
      cancelled: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    };
    return colors[status] || colors.pending;
  };

  const getSeverityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      low: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      info: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
    };
    return colors[severity] || colors.info;
  };

  const charter = run.charter ? JSON.parse(run.charter) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusBadge(
                  run.status
                )}`}
              >
                {run.status}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {run.aiProvider}
                {run.aiModel && ` (${run.aiModel})`}
              </span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white break-all">
              {run.url}
            </h1>
            <div className="flex gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
              <span>
                Created: {new Date(run.createdAt).toLocaleString()}
              </span>
              {run.startTime && (
                <span>
                  Started: {new Date(run.startTime).toLocaleTimeString()}
                </span>
              )}
              {run.endTime && (
                <span>
                  Ended: {new Date(run.endTime).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {run.status === "pending" && (
              <button
                onClick={handleStart}
                disabled={isPending}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "Starting..." : "Start Exploration"}
              </button>
            )}
            {run.status === "running" && (
              <button
                onClick={handleStop}
                disabled={isStopping}
                className="px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {isStopping ? "Stopping..." : "Stop"}
              </button>
            )}
            <Link
              href="/explore"
              className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
            >
              Back
            </Link>
          </div>
        </div>

        {/* Progress bar for running */}
        {run.status === "running" && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
              <span>{run.currentStep || "Processing..."}</span>
              <span>{run.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${run.progress}%` }}
              />
            </div>
            {run.totalActions > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {run.completedActions} / {run.totalActions} actions completed
              </div>
            )}
          </div>
        )}
      </div>

      {/* Charter */}
      {charter && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Test Charter
          </h2>
          <div className="space-y-2">
            <p className="text-gray-700 dark:text-gray-300">
              <strong>Mission:</strong> {charter.mission}
            </p>
            {charter.riskFocus && (
              <p className="text-gray-700 dark:text-gray-300">
                <strong>Risk Focus:</strong> {charter.riskFocus}
              </p>
            )}
            {charter.scope && (
              <p className="text-gray-700 dark:text-gray-300">
                <strong>Scope:</strong> {charter.scope}
              </p>
            )}
            {charter.testIdeas && charter.testIdeas.length > 0 && (
              <div>
                <strong className="text-gray-700 dark:text-gray-300">Test Ideas:</strong>
                <ul className="list-disc list-inside mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {charter.testIdeas.slice(0, 5).map((idea: { area: string; idea: string }, i: number) => (
                    <li key={i}>
                      [{idea.area}] {idea.idea}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex -mb-px">
            {(["actions", "findings", "evidence", "logs"] as const).map((tab) => {
              // Count errors and warnings for logs tab
              const errorCount = tab === "logs" ? run.logs.filter(l => l.level === "error").length : 0;
              const warnCount = tab === "logs" ? run.logs.filter(l => l.level === "warn").length : 0;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-1 ${
                    activeTab === tab
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  <span className="text-xs text-gray-400">
                    ({run[tab].length})
                  </span>
                  {tab === "logs" && errorCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 rounded">
                      {errorCount} error{errorCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  {tab === "logs" && warnCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300 rounded">
                      {warnCount} warn{warnCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4">
          {/* Actions Tab */}
          {activeTab === "actions" && (
            <div className="space-y-3">
              {run.actions.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No actions executed yet
                </p>
              ) : (
                run.actions.map((action) => (
                  <div
                    key={action.id}
                    className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded">
                            {action.actionType}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${getStatusBadge(
                              action.status
                            )}`}
                          >
                            {action.status}
                          </span>
                          {action.duration && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {action.duration}ms
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {action.description}
                        </p>
                        {action.target && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">
                            Target: {action.target}
                          </p>
                        )}
                        {action.error && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                            Error: {action.error}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {action.beforeScreenshot && (
                          <button
                            onClick={() => setSelectedScreenshot(action.beforeScreenshot)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Before
                          </button>
                        )}
                        {action.afterScreenshot && (
                          <button
                            onClick={() => setSelectedScreenshot(action.afterScreenshot)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            After
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Findings Tab */}
          {activeTab === "findings" && (
            <div className="space-y-3">
              {run.findings.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No findings yet
                </p>
              ) : (
                run.findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${getSeverityBadge(
                          finding.severity
                        )}`}
                      >
                        {finding.severity}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded">
                        {finding.type}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      {finding.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {finding.description}
                    </p>
                    {finding.recommendation && (
                      <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                        <strong>Recommendation:</strong> {finding.recommendation}
                      </p>
                    )}
                    {finding.location && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Location: {finding.location}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Evidence Tab */}
          {activeTab === "evidence" && (
            <div className="space-y-3">
              {run.evidence.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No evidence collected yet
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {run.evidence.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                    >
                      {ev.type === "screenshot" ? (
                        <button
                          onClick={() => setSelectedScreenshot(ev.path)}
                          className="w-full"
                        >
                          <div className="aspect-video bg-gray-200 dark:bg-gray-600 rounded overflow-hidden relative">
                            <Image
                              src={ev.path}
                              alt={ev.description}
                              fill
                              className="object-cover"
                            />
                          </div>
                        </button>
                      ) : (
                        <a
                          href={ev.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-3 text-center"
                        >
                          <div className="text-2xl mb-1">
                            {ev.type === "console" && "📋"}
                            {ev.type === "network" && "🌐"}
                            {ev.type === "html" && "📄"}
                            {ev.type === "video" && "🎥"}
                          </div>
                        </a>
                      )}
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                        {ev.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === "logs" && (
            <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
              {run.logs.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4 font-sans text-sm">
                  No logs yet
                </p>
              ) : (
                run.logs.map((log) => (
                  <div
                    key={log.id}
                    className={`py-1 px-2 rounded ${
                      log.level === "error"
                        ? "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300"
                        : log.level === "warn"
                        ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    <span className="text-gray-400 dark:text-gray-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>{" "}
                    <span className="font-semibold">[{log.level.toUpperCase()}]</span>{" "}
                    {log.message}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Screenshot Modal */}
      {selectedScreenshot && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedScreenshot(null)}
        >
          <div className="relative max-w-full max-h-full">
            <Image
              src={selectedScreenshot}
              alt="Screenshot"
              width={1920}
              height={1080}
              className="max-w-full max-h-[90vh] object-contain"
            />
            <button
              onClick={() => setSelectedScreenshot(null)}
              className="absolute top-2 right-2 p-2 bg-white/90 rounded-full text-gray-800 hover:bg-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Stop Confirmation Dialog */}
      {showStopConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Stop Exploration
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Are you sure you want to stop this exploration? This will:
                </p>
                <ul className="mt-2 text-sm text-gray-600 dark:text-gray-400 list-disc list-inside">
                  <li>Terminate the browser session immediately</li>
                  <li>Mark remaining actions as cancelled</li>
                  <li>Keep all evidence collected so far</li>
                </ul>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowStopConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStopConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
              >
                Stop Exploration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
