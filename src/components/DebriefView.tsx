"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateSessionDebrief, endSession } from "@/lib/actions/sessions";
import { createOutcome, createCharterFromNote, type OutcomeType } from "@/lib/actions/outcomes";
import type { Session, Charter, ProductArea, Build, Note, Outcome } from "@/generated/prisma/client";

type NoteWithOutcomes = Note & { outcomes: Outcome[] };
type SessionWithRelations = Session & {
  charter: Charter & { productArea: ProductArea | null };
  build: Build | null;
  notes: NoteWithOutcomes[];
};

interface Props {
  session: SessionWithRelations;
}

const NOTE_TYPES = {
  observation: { label: "Observation", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  question: { label: "Question", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  risk: { label: "Risk", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  bug: { label: "Bug", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  follow_up: { label: "Follow-up", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

const OUTCOME_TYPES: { value: OutcomeType; label: string }[] = [
  { value: "ticket", label: "Create Ticket" },
  { value: "new_charter", label: "New Charter" },
  { value: "automation_idea", label: "Automation Idea" },
];

export default function DebriefView({ session }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState<NoteWithOutcomes[]>(session.notes);

  // Debrief fields
  const [whatWasCovered, setWhatWasCovered] = useState(session.whatWasCovered || "");
  const [whatWasNotCovered, setWhatWasNotCovered] = useState(session.whatWasNotCovered || "");
  const [keyRisks, setKeyRisks] = useState(session.keyRisks || "");
  const [obstacles, setObstacles] = useState(session.obstacles || "");

  // Outcome creation state
  const [creatingOutcomeFor, setCreatingOutcomeFor] = useState<string | null>(null);
  const [outcomeType, setOutcomeType] = useState<OutcomeType>("ticket");
  const [outcomeDescription, setOutcomeDescription] = useState("");
  const [outcomeLink, setOutcomeLink] = useState("");

  // New charter state
  const [creatingCharterFor, setCreatingCharterFor] = useState<string | null>(null);
  const [newCharterMission, setNewCharterMission] = useState("");

  const isActive = session.status === "active";

  const handleEndSession = () => {
    startTransition(async () => {
      try {
        await endSession(session.id);
        router.refresh();
      } catch (error) {
        console.error("Failed to end session:", error);
      }
    });
  };

  const handleSaveDebrief = () => {
    startTransition(async () => {
      try {
        await updateSessionDebrief(session.id, {
          whatWasCovered: whatWasCovered.trim() || undefined,
          whatWasNotCovered: whatWasNotCovered.trim() || undefined,
          keyRisks: keyRisks.trim() || undefined,
          obstacles: obstacles.trim() || undefined,
        });
      } catch (error) {
        console.error("Failed to save debrief:", error);
      }
    });
  };

  const handleCreateOutcome = (noteId: string) => {
    if (!outcomeDescription.trim()) return;

    startTransition(async () => {
      try {
        const outcome = await createOutcome({
          noteId,
          outcomeType,
          description: outcomeDescription.trim(),
          externalLink: outcomeLink.trim() || undefined,
        });

        setNotes((prev) =>
          prev.map((note) =>
            note.id === noteId
              ? { ...note, outcomes: [...note.outcomes, outcome] }
              : note
          )
        );

        setCreatingOutcomeFor(null);
        setOutcomeDescription("");
        setOutcomeLink("");
      } catch (error) {
        console.error("Failed to create outcome:", error);
      }
    });
  };

  const handleCreateCharter = (noteId: string) => {
    if (!newCharterMission.trim()) return;

    startTransition(async () => {
      try {
        await createCharterFromNote(noteId, {
          mission: newCharterMission.trim(),
          productAreaId: session.charter.productAreaId || undefined,
        });

        // Refresh to get updated outcomes
        router.refresh();
        setCreatingCharterFor(null);
        setNewCharterMission("");
      } catch (error) {
        console.error("Failed to create charter:", error);
      }
    });
  };

  const duration = session.endTime
    ? Math.round(
        (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  isActive
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                }`}
              >
                {isActive ? "Active" : "Completed"}
              </span>
              {session.charter.productArea && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                  {session.charter.productArea.name}
                </span>
              )}
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {session.charter.mission}
            </h1>
            <div className="flex gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
              <span>Tester: {session.testerName}</span>
              <span>
                {new Date(session.startTime).toLocaleDateString()}{" "}
                {new Date(session.startTime).toLocaleTimeString()}
              </span>
              {duration && <span>Duration: {duration} min</span>}
            </div>
          </div>
          {isActive && (
            <button
              onClick={handleEndSession}
              disabled={isPending}
              className="px-4 py-2 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 font-medium rounded-md hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50"
            >
              End Session
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Debrief Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Session Debrief
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                What was covered?
              </label>
              <textarea
                value={whatWasCovered}
                onChange={(e) => setWhatWasCovered(e.target.value)}
                onBlur={handleSaveDebrief}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                rows={3}
                placeholder="What areas, features, or scenarios did you explore?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                What was NOT covered?
              </label>
              <textarea
                value={whatWasNotCovered}
                onChange={(e) => setWhatWasNotCovered(e.target.value)}
                onBlur={handleSaveDebrief}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                rows={3}
                placeholder="What areas were out of scope or didn't get explored?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Key risks discovered
              </label>
              <textarea
                value={keyRisks}
                onChange={(e) => setKeyRisks(e.target.value)}
                onBlur={handleSaveDebrief}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                rows={3}
                placeholder="What risks or concerns emerged from this session?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Obstacles encountered
              </label>
              <textarea
                value={obstacles}
                onChange={(e) => setObstacles(e.target.value)}
                onBlur={handleSaveDebrief}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                rows={3}
                placeholder="Any blockers, test environment issues, or other obstacles?"
              />
            </div>
          </div>
        </div>

        {/* Notes Review */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Session Notes ({notes.length})
          </h2>
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {notes.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                No notes recorded in this session
              </p>
            ) : (
              notes.map((note) => {
                const typeInfo = NOTE_TYPES[note.type as keyof typeof NOTE_TYPES];
                return (
                  <div
                    key={note.id}
                    className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded ${
                          typeInfo?.color || "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {typeInfo?.label || note.type}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 dark:text-white whitespace-pre-wrap text-sm">
                          {note.text}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(note.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    {/* Existing outcomes */}
                    {note.outcomes.length > 0 && (
                      <div className="mt-2 pl-4 border-l-2 border-gray-200 dark:border-gray-600">
                        {note.outcomes.map((outcome) => (
                          <div
                            key={outcome.id}
                            className="text-xs text-gray-600 dark:text-gray-400"
                          >
                            <span className="font-medium">
                              {outcome.outcomeType === "ticket"
                                ? "Ticket"
                                : outcome.outcomeType === "new_charter"
                                ? "Follow-up Charter"
                                : "Automation Idea"}
                              :
                            </span>{" "}
                            {outcome.description}
                            {outcome.externalLink && (
                              <a
                                href={outcome.externalLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                [Link]
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="mt-2 flex gap-2">
                      {creatingOutcomeFor === note.id ? (
                        <div className="flex-1 space-y-2">
                          <select
                            value={outcomeType}
                            onChange={(e) => setOutcomeType(e.target.value as OutcomeType)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                          >
                            {OUTCOME_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={outcomeDescription}
                            onChange={(e) => setOutcomeDescription(e.target.value)}
                            placeholder="Description..."
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                          />
                          <input
                            type="url"
                            value={outcomeLink}
                            onChange={(e) => setOutcomeLink(e.target.value)}
                            placeholder="External link (optional)"
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleCreateOutcome(note.id)}
                              disabled={isPending || !outcomeDescription.trim()}
                              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setCreatingOutcomeFor(null);
                                setOutcomeDescription("");
                                setOutcomeLink("");
                              }}
                              className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : creatingCharterFor === note.id ? (
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={newCharterMission}
                            onChange={(e) => setNewCharterMission(e.target.value)}
                            placeholder="Charter mission..."
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleCreateCharter(note.id)}
                              disabled={isPending || !newCharterMission.trim()}
                              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              Create Charter
                            </button>
                            <button
                              onClick={() => {
                                setCreatingCharterFor(null);
                                setNewCharterMission("");
                              }}
                              className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setCreatingOutcomeFor(note.id)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            + Outcome
                          </button>
                          <button
                            onClick={() => {
                              setCreatingCharterFor(note.id);
                              setNewCharterMission(
                                note.type === "follow_up" ? note.text : ""
                              );
                            }}
                            className="text-xs text-green-600 dark:text-green-400 hover:underline"
                          >
                            + Follow-up Charter
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Link
          href="/history"
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          View all sessions
        </Link>
        <Link
          href="/"
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
        >
          Start New Session
        </Link>
      </div>
    </div>
  );
}
