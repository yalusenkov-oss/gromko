export function formatDuration(seconds: number | string): string {
  const num = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  if (!num || isNaN(num) || num <= 0) return '0:00';
  const total = Math.floor(num);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatPlays(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
