const KEY = "keyora:password-recovery";
const MAX_AGE_MS = 60 * 60 * 1000;

export function markPasswordRecovery(userId: string): void {
  if (typeof window !== "undefined") sessionStorage.setItem(KEY, JSON.stringify({ userId, at: Date.now() }));
}

export function readPasswordRecovery(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { userId?: string; at?: number } | null;
    if (value?.userId && typeof value.at === "number" && Date.now() - value.at < MAX_AGE_MS) return value.userId;
  } catch { /* invalid or expired marker */ }
  clearPasswordRecovery();
  return null;
}

export function clearPasswordRecovery(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem(KEY);
}
