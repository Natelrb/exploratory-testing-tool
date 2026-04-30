"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createExplorationRun, deleteExplorationRun } from "@/lib/actions/exploration";
import type { ExplorationRun } from "@/generated/prisma/client";

interface AIStatus {
  currentProvider: {
    config: { provider: string; model?: string };
    info: { name: string; description: string; capabilities: string[] };
  };
  ollama: { available: boolean; models: string[] };
  hasAnthropicKey: boolean;
  hasOpenAIKey: boolean;
}

interface SavedConfig {
  id: string;
  name: string;
  url: string;
  username: string | null;
  password: string | null;
  description: string | null;
}

interface Props {
  initialRuns: (ExplorationRun & {
    _count: { actions: number; findings: number; logs: number };
  })[];
}

interface ParsedACPreview {
  externalId: string;
  given: string;
  when: string;
  then: string;
  priority: "must" | "should" | "could";
  oracle: { kind: string; [k: string]: unknown };
  oracleConfidence: "high" | "medium" | "low";
}

export default function ExplorePageClient({ initialRuns }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [headless, setHeadless] = useState(true);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [loadingAI, setLoadingAI] = useState(true);
  const [runs, setRuns] = useState(initialRuns);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; url: string } | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<string>("");
  const [acText, setAcText] = useState("");
  const [parsedACs, setParsedACs] = useState<ParsedACPreview[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Update runs when initialRuns changes (after revalidation)
  useEffect(() => {
    setRuns(initialRuns);
  }, [initialRuns]);

  useEffect(() => {
    // Fetch AI status
    fetch("/api/ai/status")
      .then((res) => res.json())
      .then(setAiStatus)
      .catch(console.error)
      .finally(() => setLoadingAI(false));

    // Fetch saved configurations
    fetch("/api/configurations")
      .then((res) => res.json())
      .then(setSavedConfigs)
      .catch(console.error);
  }, []);

  const handleConfigSelect = (configId: string) => {
    setSelectedConfig(configId);
    if (!configId) {
      // Reset to empty
      setUrl("");
      setUsername("");
      setPassword("");
      return;
    }

    const config = savedConfigs.find((c) => c.id === configId);
    if (config) {
      setUrl(config.url);
      setUsername(config.username || "");
      setPassword(config.password || "");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      alert("Please enter a URL to explore");
      return;
    }

    // Auto-add https:// if no protocol is specified
    let finalUrl = url.trim();
    if (!finalUrl.match(/^https?:\/\//i)) {
      finalUrl = `https://${finalUrl}`;
    }

    startTransition(async () => {
      try {
        const run = await createExplorationRun({
          url: finalUrl,
          aiProvider: aiStatus?.currentProvider.config.provider || "heuristic",
          aiModel: aiStatus?.currentProvider.config.model,
          config: {
            username: username.trim() || undefined,
            password: password.trim() || undefined,
            headless,
          },
          acceptanceCriteriaText: acText.trim() || undefined,
        });

        router.push(`/explore/${run.id}`);
      } catch (error) {
        console.error("Failed to create exploration:", error);
        alert("Failed to create exploration. Please try again.");
      }
    });
  };

  const handlePreviewParse = async () => {
    setParseError(null);
    setParsing(true);
    setParsedACs(null);
    try {
      const res = await fetch("/api/ai/parse-acs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: acText }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Parse failed (${res.status})`);
      }
      const parsed: ParsedACPreview[] = await res.json();
      setParsedACs(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string, url: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirm({ id, url });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;

    const { id } = deleteConfirm;
    setDeleteConfirm(null);
    setDeletingId(id);

    try {
      // Optimistically remove from local state
      setRuns((prev) => prev.filter((run) => run.id !== id));
      await deleteExplorationRun(id);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete exploration:", error);
      alert("Failed to delete exploration. Please try again.");
      // Restore the item on error
      setRuns(initialRuns);
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
      running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    };
    return colors[status] || colors.pending;
  };

  return (
    <div className="space-y-6">
      {/* New Exploration Form */}
      <div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            New Exploration
          </h2>

          {/* AI Status */}
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              AI Provider
            </div>
            {loadingAI ? (
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Detecting...
              </div>
            ) : aiStatus ? (
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {aiStatus.currentProvider.info.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {aiStatus.currentProvider.info.description}
                </div>
                {aiStatus.currentProvider.config.provider === "heuristic" && (
                  <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                    Tip: Install Ollama for smarter analysis
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-red-600 dark:text-red-400">
                Failed to detect AI provider
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Saved Configuration Selector */}
            {savedConfigs.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Load Saved Configuration
                </label>
                <select
                  value={selectedConfig}
                  onChange={(e) => handleConfigSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">Select a saved configuration...</option>
                  {savedConfigs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.name} - {config.url}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                URL to Explore *
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                required
              />
            </div>

            <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Authentication (optional)
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username or email"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Acceptance Criteria (optional)
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Free-form Given/When/Then. When provided, the AI verifies each AC instead of doing free exploration.
              </p>
              <textarea
                value={acText}
                onChange={(e) => {
                  setAcText(e.target.value);
                  setParsedACs(null);
                }}
                placeholder={`AC-1\nGiven I am on the alerts page\nWhen I filter by severity 'critical'\nThen only critical alerts are shown\n\nAC-2\nGiven I am logged in\nWhen I open the user menu\nThen I see a "Sign out" option`}
                rows={14}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white text-sm font-mono resize-y min-h-[200px]"
              />
              {acText.trim() && (
                <button
                  type="button"
                  onClick={handlePreviewParse}
                  disabled={parsing}
                  className="mt-2 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  {parsing ? "Parsing..." : "Preview parse"}
                </button>
              )}
              {parseError && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400">{parseError}</div>
              )}
              {parsedACs && parsedACs.length === 0 && !parsing && (
                <div className="mt-2 text-xs text-yellow-700 dark:text-yellow-300">
                  Parser produced no ACs. The text will be saved as-is and judged by the LLM at runtime.
                </div>
              )}
              {parsedACs && parsedACs.length > 0 && (
                <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
                  {parsedACs.map((ac, i) => (
                    <div
                      key={i}
                      className="p-2 text-xs bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-semibold">{ac.externalId}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {ac.priority}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            ac.oracleConfidence === "high"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : ac.oracleConfidence === "medium"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                              : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          }`}
                          title="Oracle confidence"
                        >
                          oracle: {ac.oracle.kind} ({ac.oracleConfidence})
                        </span>
                      </div>
                      <div className="text-gray-700 dark:text-gray-300">
                        <div><span className="font-semibold">Given</span> {ac.given}</div>
                        <div><span className="font-semibold">When</span> {ac.when}</div>
                        <div><span className="font-semibold">Then</span> {ac.then}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="headless"
                checked={headless}
                onChange={(e) => setHeadless(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <label
                htmlFor="headless"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                Run headless (no browser window)
              </label>
            </div>

            <button
              type="submit"
              disabled={isPending || !url.trim()}
              className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Creating..." : "Start Exploration"}
            </button>
          </form>
        </div>
      </div>

      {/* Past Explorations */}
      <div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Exploration History
          </h2>

          {runs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No explorations yet. Start one to see AI-powered testing in action!
            </p>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="relative p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Link
                    href={`/explore/${run.id}`}
                    className="block"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
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
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate pr-8">
                          {run.url}
                        </p>
                        <div className="flex gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            {new Date(run.createdAt).toLocaleDateString()}{" "}
                            {new Date(run.createdAt).toLocaleTimeString()}
                          </span>
                          {run.status === "running" && (
                            <span className="text-blue-600 dark:text-blue-400">
                              {run.progress}% complete
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-4 mr-8 flex gap-2 text-xs">
                        {run._count.findings > 0 && (
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 rounded">
                            {run._count.findings} finding{run._count.findings > 1 ? "s" : ""}
                          </span>
                        )}
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300 rounded">
                          {run._count.actions} action{run._count.actions > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={(e) => handleDeleteClick(e, run.id, run.url)}
                    disabled={deletingId === run.id || run.status === "running"}
                    className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={run.status === "running" ? "Cannot delete running exploration" : "Delete exploration"}
                  >
                    {deletingId === run.id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Delete Exploration
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Are you sure you want to delete this exploration? This will permanently remove:
                </p>
                <ul className="mt-2 text-sm text-gray-600 dark:text-gray-400 list-disc list-inside">
                  <li>All screenshots and evidence files</li>
                  <li>Action history and logs</li>
                  <li>Findings and recommendations</li>
                </ul>
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-500 truncate">
                  {deleteConfirm.url}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
