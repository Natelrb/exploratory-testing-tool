// Exploration Manager - tracks and controls running explorations

import type { Browser } from "playwright";

interface RunningExploration {
  id: string;
  browser: Browser | null;
  shouldStop: boolean;
  startedAt: Date;
}

class ExplorationManager {
  private explorations: Map<string, RunningExploration> = new Map();

  register(id: string): void {
    this.explorations.set(id, {
      id,
      browser: null,
      shouldStop: false,
      startedAt: new Date(),
    });
  }

  setBrowser(id: string, browser: Browser): void {
    const exploration = this.explorations.get(id);
    if (exploration) {
      exploration.browser = browser;
    }
  }

  shouldStop(id: string): boolean {
    return this.explorations.get(id)?.shouldStop ?? false;
  }

  stop(id: string): void {
    const exploration = this.explorations.get(id);
    if (exploration) {
      exploration.shouldStop = true;
      // Force close the browser if it exists
      if (exploration.browser) {
        exploration.browser.close().catch(console.error);
      }
    }
  }

  unregister(id: string): void {
    this.explorations.delete(id);
  }

  getRunning(): string[] {
    return Array.from(this.explorations.keys());
  }

  isRunning(id: string): boolean {
    return this.explorations.has(id);
  }
}

// Singleton instance
export const explorationManager = new ExplorationManager();
