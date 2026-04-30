"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useExplorationDetail } from "@/features/exploration/presentation/hooks/use-exploration-detail";
import { useExplorationActions } from "@/features/exploration/presentation/hooks/use-exploration-actions";
import Image from "next/image";
import type {
  ExplorationRun,
  ExplorationAction,
  ExplorationFinding,
  ExplorationEvidence,
  ExplorationLog,
  Session,
  Charter,
  AcceptanceCriterion,
  ACVerdict,
} from "@/generated/prisma/client";

type RunWithRelations = ExplorationRun & {
  actions: ExplorationAction[];
  findings: ExplorationFinding[];
  evidence: ExplorationEvidence[];
  logs: ExplorationLog[];
  session: (Session & { charter: Charter }) | null;
  acceptanceCriteria: (AcceptanceCriterion & { verdicts: ACVerdict[] })[];
};

interface Props {
  run: RunWithRelations;
}

export default function ExplorationDetailClient({ run: initialRun }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Use custom hooks
  const {
    run,
    activeTab,
    selectedScreenshot,
    showStopConfirm,
    showRerunConfirm,
    logLevelFilter,
    setActiveTab,
    setSelectedScreenshot,
    setShowStopConfirm,
    setShowRerunConfirm,
    setLogLevelFilter,
  } = useExplorationDetail(initialRun);

  const {
    startExploration,
    stopExploration,
    rerunExploration,
    isStarting,
    isStopping,
    isRerunning,
    error: actionError,
    clearError,
  } = useExplorationActions(run.id);

  const handleStart = async () => {
    startTransition(async () => {
      await startExploration();
    });
  };

  const handleStop = () => {
    setShowStopConfirm(true);
  };

  const handleStopConfirm = async () => {
    setShowStopConfirm(false);
    await stopExploration();
  };

  const handleRerun = () => {
    setShowRerunConfirm(true);
  };

  const handleRerunConfirm = async () => {
    setShowRerunConfirm(false);

    startTransition(async () => {
      const newRunId = await rerunExploration();
      if (newRunId) {
        router.push(`/explore/${newRunId}`);
      }
    });
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
                disabled={isStarting}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isStarting ? "Starting..." : "Start Exploration"}
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
            {(run.status === "completed" || run.status === "failed") && run.plan && (
              <button
                onClick={handleRerun}
                disabled={isRerunning}
                className="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 disabled:opacity-50"
                title="Rerun with the same test plan"
              >
                {isRerunning ? "Starting rerun..." : "Rerun"}
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

        {/* Action Error */}
        {actionError && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Action failed
                </p>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                  {actionError}
                </p>
              </div>
              <button
                onClick={clearError}
                className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

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
            {(["criteria", "actions", "findings", "evidence", "logs"] as const).map((tab) => {
              // Hide criteria tab if no ACs.
              if (tab === "criteria" && (!run.acceptanceCriteria || run.acceptanceCriteria.length === 0)) {
                return null;
              }
              // Count errors and warnings for logs tab
              const errorCount = tab === "logs" ? run.logs.filter((l: ExplorationLog) => l.level === "error").length : 0;
              const warnCount = tab === "logs" ? run.logs.filter((l: ExplorationLog) => l.level === "warn").length : 0;

              const tabCount =
                tab === "criteria"
                  ? run.acceptanceCriteria.length
                  : (run as unknown as Record<string, unknown[]>)[tab].length;

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
                  {tab === "criteria" ? "Acceptance Criteria" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  <span className="text-xs text-gray-400">
                    ({tabCount})
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
          {/* Acceptance Criteria Tab */}
          {activeTab === "criteria" && (
            <div className="space-y-3">
              {run.acceptanceCriteria.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No acceptance criteria for this run
                </p>
              ) : (
                <>
                  {/* Summary row */}
                  {(() => {
                    const counts = { pass: 0, fail: 0, blocked: 0, error: 0, pending: 0 };
                    for (const ac of run.acceptanceCriteria as (AcceptanceCriterion & { verdicts: ACVerdict[] })[]) {
                      const v = ac.verdicts[0];
                      if (!v) counts.pending++;
                      else (counts as Record<string, number>)[v.status]++;
                    }
                    return (
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          {counts.pass} pass
                        </span>
                        <span className="px-2 py-1 rounded bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                          {counts.fail} fail
                        </span>
                        <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                          {counts.blocked} blocked
                        </span>
                        {counts.error > 0 && (
                          <span className="px-2 py-1 rounded bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                            {counts.error} error
                          </span>
                        )}
                        {counts.pending > 0 && (
                          <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                            {counts.pending} pending
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {(run.acceptanceCriteria as (AcceptanceCriterion & { verdicts: ACVerdict[] })[]).map((ac) => {
                    const verdict = ac.verdicts[0];
                    const status = verdict?.status ?? "pending";
                    const statusColor: Record<string, string> = {
                      pass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                      fail: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
                      blocked: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
                      error: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
                      pending: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
                    };
                    let oracle: { kind: string; [k: string]: unknown } | null = null;
                    try {
                      oracle = JSON.parse(ac.oracle);
                    } catch {
                      // ignore
                    }
                    return (
                      <div
                        key={ac.id}
                        className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono font-semibold text-sm">
                            {ac.externalId}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColor[status]}`}>
                            {status}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {ac.priority}
                          </span>
                          {oracle && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                              oracle: {oracle.kind}
                            </span>
                          )}
                          {verdict?.duration != null && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {verdict.duration}ms
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                          {ac.given && <div><span className="font-semibold text-gray-600 dark:text-gray-400">Given</span> {ac.given}</div>}
                          {ac.whenText && <div><span className="font-semibold text-gray-600 dark:text-gray-400">When</span> {ac.whenText}</div>}
                          {ac.thenText && <div><span className="font-semibold text-gray-600 dark:text-gray-400">Then</span> {ac.thenText}</div>}
                        </div>
                        {verdict?.reason && (
                          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 border-l-2 border-gray-300 dark:border-gray-600 pl-2">
                            {verdict.reason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Actions Tab */}
          {activeTab === "actions" && (
            <div className="space-y-3">
              {run.actions.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No actions executed yet
                </p>
              ) : (
                run.actions.map((action: ExplorationAction) => (
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
                run.findings.map((finding: ExplorationFinding) => (
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
                  {run.evidence.map((ev: ExplorationEvidence) => (
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
                      ) : ev.type === "video" ? (
                        <div className="w-full">
                          <div className="aspect-video bg-gray-900 rounded overflow-hidden">
                            <video
                              controls
                              className="w-full h-full"
                              preload="metadata"
                            >
                              <source src={ev.path} type="video/webm" />
                              Your browser does not support the video tag.
                            </video>
                          </div>
                          <a
                            href={ev.path}
                            download
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
                          >
                            Download video
                          </a>
                        </div>
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
            <div className="space-y-3">
              {/* Log Level Filter */}
              <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
                <button
                  onClick={() => setLogLevelFilter("all")}
                  className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                    logLevelFilter === "all"
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  All ({run.logs.length})
                </button>
                <button
                  onClick={() => setLogLevelFilter("error")}
                  className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                    logLevelFilter === "error"
                      ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  Errors ({run.logs.filter((l: ExplorationLog) => l.level === "error").length})
                </button>
                <button
                  onClick={() => setLogLevelFilter("warn")}
                  className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                    logLevelFilter === "warn"
                      ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  Warnings ({run.logs.filter((l: ExplorationLog) => l.level === "warn").length})
                </button>
                <button
                  onClick={() => setLogLevelFilter("info")}
                  className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                    logLevelFilter === "info"
                      ? "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  Info ({run.logs.filter((l: ExplorationLog) => l.level === "info").length})
                </button>
              </div>

              {/* Filtered Logs */}
              <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
                {(() => {
                  const filteredLogs = logLevelFilter === "all"
                    ? run.logs
                    : run.logs.filter((log: ExplorationLog) => log.level === logLevelFilter);

                  return filteredLogs.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-4 font-sans text-sm">
                      No {logLevelFilter === "all" ? "" : logLevelFilter} logs
                    </p>
                  ) : (
                    filteredLogs.map((log: ExplorationLog) => (
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
                  );
                })()}
              </div>
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

      {/* Rerun Confirmation Dialog */}
      {showRerunConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Rerun Exploration
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  This will start a new exploration run using the exact same test plan. The rerun will:
                </p>
                <ul className="mt-2 text-sm text-gray-600 dark:text-gray-400 list-disc list-inside">
                  <li>Use the same URL and configuration</li>
                  <li>Execute identical test ideas and steps</li>
                  <li>Create a new run for comparison</li>
                  <li>Skip AI planning (uses saved plan)</li>
                </ul>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowRerunConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRerunConfirm}
                disabled={isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-md transition-colors"
              >
                {isPending ? "Starting..." : "Start Rerun"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
