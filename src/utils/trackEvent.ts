/**
 * Utility to record user events for the recommendation engine.
 * Fire-and-forget — never blocks UI.
 */

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');

export function trackEvent(
  eventType: string,
  data?: Record<string, any>,
): void {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('gromko_token') : null;
  if (!token) return; // not logged in — skip

  fetch(`${API_BASE}/api/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      eventType,
      ...data,
    }),
  }).catch(() => {}); // fire & forget
}
