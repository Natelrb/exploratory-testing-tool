import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export type TabType = 'actions' | 'findings' | 'evidence' | 'logs';
export type LogLevel = 'all' | 'error' | 'warn' | 'info';

interface ExplorationRun {
  id: string;
  status: string;
  [key: string]: any;
}

/**
 * Hook for managing exploration detail state
 * Handles tabs, polling for updates, and modal states
 */
export function useExplorationDetail(initialRun: ExplorationRun) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [activeTab, setActiveTab] = useState<TabType>('actions');
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showRerunConfirm, setShowRerunConfirm] = useState(false);
  const [logLevelFilter, setLogLevelFilter] = useState<LogLevel>('all');

  // Auto-refresh when exploration is running
  useEffect(() => {
    if (run.status !== 'running' && run.status !== 'pending') return;

    const interval = setInterval(() => {
      router.refresh();
    }, 2000);

    return () => clearInterval(interval);
  }, [run.status, router]);

  // Update run when initialRun changes (from server refresh)
  useEffect(() => {
    setRun(initialRun);
  }, [initialRun]);

  return {
    // State
    run,
    activeTab,
    selectedScreenshot,
    showStopConfirm,
    showRerunConfirm,
    logLevelFilter,

    // Setters
    setActiveTab,
    setSelectedScreenshot,
    setShowStopConfirm,
    setShowRerunConfirm,
    setLogLevelFilter,
  };
}
