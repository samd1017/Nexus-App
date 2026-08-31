/** First-run coach + shortcuts sheet prefs (localStorage). */

const COACH_KEY = "nexus-first-run-coach-v1";

export function isFirstRunCoachDone(): boolean {
  try {
    return localStorage.getItem(COACH_KEY) === "done";
  } catch {
    return true;
  }
}

export function markFirstRunCoachDone(): void {
  try {
    localStorage.setItem(COACH_KEY, "done");
  } catch {
    /* ignore quota / private mode */
  }
}

export function resetFirstRunCoach(): void {
  try {
    localStorage.removeItem(COACH_KEY);
  } catch {
    /* ignore */
  }
}
