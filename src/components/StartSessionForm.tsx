"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProductArea } from "@/lib/actions/product-areas";
import { createBuild } from "@/lib/actions/builds";
import { createCharter } from "@/lib/actions/charters";
import { createSession } from "@/lib/actions/sessions";
import type { ProductArea, Build, Charter } from "@/generated/prisma/client";

interface Props {
  productAreas: ProductArea[];
  builds: Build[];
  charterTemplates: (Charter & { productArea: ProductArea | null })[];
}

export default function StartSessionForm({ productAreas, builds, charterTemplates }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form state
  const [selectedProductAreaId, setSelectedProductAreaId] = useState<string>("");
  const [newProductAreaName, setNewProductAreaName] = useState("");
  const [showNewProductArea, setShowNewProductArea] = useState(false);

  const [selectedBuildId, setSelectedBuildId] = useState<string>("");
  const [newBuildVersion, setNewBuildVersion] = useState("");
  const [newBuildEnv, setNewBuildEnv] = useState("local");
  const [showNewBuild, setShowNewBuild] = useState(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [charterMission, setCharterMission] = useState("");
  const [charterRiskFocus, setCharterRiskFocus] = useState("");
  const [charterScope, setCharterScope] = useState("");

  const [timeboxMinutes, setTimeboxMinutes] = useState(30);
  const [testerName, setTesterName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("testerName") || "";
    }
    return "";
  });

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId) {
      const template = charterTemplates.find((t) => t.id === templateId);
      if (template) {
        setCharterMission(template.mission);
        setCharterRiskFocus(template.riskFocus || "");
        setCharterScope(template.scope || "");
        if (template.productAreaId) {
          setSelectedProductAreaId(template.productAreaId);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!charterMission.trim()) {
      alert("Please enter a charter mission");
      return;
    }

    if (!testerName.trim()) {
      alert("Please enter your name");
      return;
    }

    startTransition(async () => {
      try {
        // Save tester name for future sessions
        localStorage.setItem("testerName", testerName);

        // Create product area if needed
        let productAreaId = selectedProductAreaId;
        if (showNewProductArea && newProductAreaName.trim()) {
          const newArea = await createProductArea({ name: newProductAreaName.trim() });
          productAreaId = newArea.id;
        }

        // Create build if needed
        let buildId = selectedBuildId || undefined;
        if (showNewBuild && newBuildVersion.trim()) {
          const newBuild = await createBuild({
            version: newBuildVersion.trim(),
            environment: newBuildEnv,
          });
          buildId = newBuild.id;
        }

        // Create charter
        const charter = await createCharter({
          mission: charterMission.trim(),
          riskFocus: charterRiskFocus.trim() || undefined,
          scope: charterScope.trim() || undefined,
          productAreaId: productAreaId || undefined,
        });

        // Create session
        const session = await createSession({
          charterId: charter.id,
          buildId,
          testerName: testerName.trim(),
          timeboxMinutes,
        });

        router.push(`/session/${session.id}`);
      } catch (error) {
        console.error("Failed to create session:", error);
        alert("Failed to create session. Please try again.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Tester Name */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Your Name
        </label>
        <input
          type="text"
          value={testerName}
          onChange={(e) => setTesterName(e.target.value)}
          className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          placeholder="Enter your name"
          required
        />
      </div>

      {/* Product Area */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Product Area (optional)
        </label>
        {!showNewProductArea ? (
          <div className="flex gap-2 items-center">
            <select
              value={selectedProductAreaId}
              onChange={(e) => setSelectedProductAreaId(e.target.value)}
              className="flex-1 max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Select product area...</option>
              {productAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewProductArea(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              + New
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={newProductAreaName}
              onChange={(e) => setNewProductAreaName(e.target.value)}
              className="flex-1 max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="New product area name"
            />
            <button
              type="button"
              onClick={() => {
                setShowNewProductArea(false);
                setNewProductAreaName("");
              }}
              className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Build */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Build (optional)
        </label>
        {!showNewBuild ? (
          <div className="flex gap-2 items-center">
            <select
              value={selectedBuildId}
              onChange={(e) => setSelectedBuildId(e.target.value)}
              className="flex-1 max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Select build...</option>
              {builds.map((build) => (
                <option key={build.id} value={build.id}>
                  {build.version} ({build.environment})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewBuild(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              + New
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-center flex-wrap">
            <input
              type="text"
              value={newBuildVersion}
              onChange={(e) => setNewBuildVersion(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Version (e.g., commit SHA)"
            />
            <select
              value={newBuildEnv}
              onChange={(e) => setNewBuildEnv(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="local">Local</option>
              <option value="staging">Staging</option>
              <option value="prod-like">Prod-like</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setShowNewBuild(false);
                setNewBuildVersion("");
              }}
              className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Charter */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Charter
        </label>

        {charterTemplates.length > 0 && (
          <div className="mb-4">
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Use a template...</option>
              {charterTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.mission}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Mission *
            </label>
            <textarea
              value={charterMission}
              onChange={(e) => setCharterMission(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Explore [target] using [resources] to discover [information]"
              rows={2}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Risk Focus (optional)
            </label>
            <input
              type="text"
              value={charterRiskFocus}
              onChange={(e) => setCharterRiskFocus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="What risk are you trying to uncover?"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Scope (optional)
            </label>
            <input
              type="text"
              value={charterScope}
              onChange={(e) => setCharterScope(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="What's in scope for this session?"
            />
          </div>
        </div>
      </div>

      {/* Timebox */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Timebox
        </label>
        <div className="flex gap-2 items-center">
          <select
            value={timeboxMinutes}
            onChange={(e) => setTimeboxMinutes(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>60 minutes</option>
            <option value={90}>90 minutes</option>
          </select>
        </div>
      </div>

      {/* Submit */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Starting..." : "Start Session"}
        </button>
      </div>
    </form>
  );
}
