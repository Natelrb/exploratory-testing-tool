"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNote, type NoteType } from "@/lib/actions/notes";
import { endSession } from "@/lib/actions/sessions";
import type { Session, Charter, ProductArea, Build, Note } from "@/generated/prisma/client";

type SessionWithRelations = Session & {
  charter: Charter & { productArea: ProductArea | null };
  build: Build | null;
  notes: Note[];
};

interface Props {
  session: SessionWithRelations;
}

const NOTE_TYPES: { value: NoteType; label: string; shortcut: string; color: string }[] = [
  { value: "observation", label: "Observation", shortcut: "O", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { value: "question", label: "Question", shortcut: "Q", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { value: "risk", label: "Risk", shortcut: "R", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  { value: "bug", label: "Bug", shortcut: "B", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  { value: "follow_up", label: "Follow-up", shortcut: "F", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
];

export default function LiveSessionView({ session }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Note[]>(session.notes);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("observation");
  const [timeRemaining, setTimeRemaining] = useState<number>(() => {
    const elapsed = Date.now() - new Date(session.startTime).getTime();
    const total = session.timeboxMinutes * 60 * 1000;
    return Math.max(0, total - elapsed);
  });
  const [isTimeUp, setIsTimeUp] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const notesEndRef = useRef<HTMLDivElement>(null);

  // Timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        const newTime = Math.max(0, prev - 1000);
        if (newTime === 0 && !isTimeUp) {
          setIsTimeUp(true);
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimeUp]);

  // Scroll to bottom when notes change
  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to submit note
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleAddNote();
        return;
      }

      // Don't handle shortcuts if typing in textarea
      if (document.activeElement === textareaRef.current) {
        return;
      }

      // N to focus note input
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        textareaRef.current?.focus();
        return;
      }

      // Note type shortcuts (when not focused on textarea)
      const typeShortcut = NOTE_TYPES.find(
        (t) => t.shortcut.toLowerCase() === e.key.toLowerCase()
      );
      if (typeShortcut) {
        e.preventDefault();
        setNoteType(typeShortcut.value);
        textareaRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [noteText]);

  const handleAddNote = useCallback(() => {
    if (!noteText.trim()) return;

    const text = noteText.trim();
    const type = noteType;

    setNoteText("");
    textareaRef.current?.focus();

    startTransition(async () => {
      try {
        const newNote = await createNote({
          sessionId: session.id,
          type,
          text,
        });
        setNotes((prev) => [...prev, newNote]);
      } catch (error) {
        console.error("Failed to add note:", error);
        setNoteText(text); // Restore the text if failed
      }
    });
  }, [noteText, noteType, session.id]);

  const handleEndSession = () => {
    if (!confirm("End this session and proceed to debrief?")) return;

    startTransition(async () => {
      try {
        await endSession(session.id);
        router.push(`/debrief/${session.id}`);
      } catch (error) {
        console.error("Failed to end session:", error);
      }
    });
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getTimerColor = () => {
    if (timeRemaining <= 0) return "text-red-600 dark:text-red-400";
    if (timeRemaining <= 5 * 60 * 1000) return "text-orange-600 dark:text-orange-400";
    return "text-gray-900 dark:text-white";
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header with timer and charter */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {session.charter.productArea && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                  {session.charter.productArea.name}
                </span>
              )}
              {session.build && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                  {session.build.version} ({session.build.environment})
                </span>
              )}
            </div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              {session.charter.mission}
            </h1>
            {session.charter.riskFocus && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Risk focus: {session.charter.riskFocus}
              </p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Tester: {session.testerName}
            </p>
          </div>
          <div className="text-right ml-4">
            <div className={`text-3xl font-mono font-bold ${getTimerColor()}`}>
              {formatTime(timeRemaining)}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              {isTimeUp ? "Time's up!" : `of ${session.timeboxMinutes} min`}
            </p>
          </div>
        </div>

        {isTimeUp && (
          <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-800 dark:text-yellow-200">
            Timebox complete! You can continue or end the session when ready.
          </div>
        )}
      </div>

      {/* Notes list */}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          {notes.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              <p>No notes yet. Start exploring and capture your findings!</p>
              <p className="text-sm mt-2">Press N to focus the note input</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => {
                const typeInfo = NOTE_TYPES.find((t) => t.value === note.type);
                return (
                  <div
                    key={note.id}
                    className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <span
                      className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded ${
                        typeInfo?.color || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {typeInfo?.label || note.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                        {note.text}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(note.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={notesEndRef} />
            </div>
          )}
        </div>

        {/* Note input */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="flex gap-2 mb-3">
            {NOTE_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => {
                  setNoteType(type.value);
                  textareaRef.current?.focus();
                }}
                className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                  noteType === type.value
                    ? type.color
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                {type.label}
                <span className="ml-1 text-xs opacity-60">({type.shortcut})</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleAddNote();
                }
              }}
              placeholder="Add a note... (Ctrl+Enter to submit)"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white resize-none"
              rows={2}
            />
            <button
              type="button"
              onClick={handleAddNote}
              disabled={!noteText.trim() || isPending}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed self-end"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Shortcuts: N = focus input, O/Q/R/B/F = note type, Ctrl+Enter = submit
          </p>
        </div>
      </div>

      {/* End session button */}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleEndSession}
          disabled={isPending}
          className="px-4 py-2 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 font-medium rounded-md hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50"
        >
          End Session
        </button>
      </div>
    </div>
  );
}
