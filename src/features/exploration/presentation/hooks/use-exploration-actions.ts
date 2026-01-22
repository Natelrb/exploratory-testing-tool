import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApiResponse } from '@/lib/api-response';

/**
 * Hook for managing exploration actions (start, stop, rerun)
 * Extracts action logic from ExplorationDetailClient
 */
export function useExplorationActions(runId: string) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startExploration = async () => {
    setIsStarting(true);
    setError(null);

    try {
      const response = await fetch(`/api/explore/${runId}/start`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to start exploration');
      }

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start exploration';
      setError(message);
      console.error('Start exploration error:', err);
    } finally {
      setIsStarting(false);
    }
  };

  const stopExploration = async () => {
    setIsStopping(true);
    setError(null);

    try {
      const response = await fetch(`/api/explore/${runId}/stop`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to stop exploration');
      }

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop exploration';
      setError(message);
      console.error('Stop exploration error:', err);
    } finally {
      setIsStopping(false);
    }
  };

  const rerunExploration = async (): Promise<string | null> => {
    setIsRerunning(true);
    setError(null);

    try {
      const response = await fetch(`/api/explore/${runId}/rerun`, {
        method: 'POST',
      });

      const data: ApiResponse<{ runId: string; usingSavedPlan: boolean }> = await response.json();

      if (!response.ok) {
        const errorMsg = data.success === false
          ? data.error.message
          : 'Failed to rerun exploration';
        throw new Error(errorMsg);
      }

      if (data.success) {
        return data.data.runId;
      }

      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rerun exploration';
      setError(message);
      console.error('Rerun exploration error:', err);
      return null;
    } finally {
      setIsRerunning(false);
    }
  };

  const clearError = () => setError(null);

  return {
    startExploration,
    stopExploration,
    rerunExploration,
    isStarting,
    isStopping,
    isRerunning,
    error,
    clearError,
  };
}
