export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) {
    return '<1m';
  }
  if (abs < hour) {
    return `${Math.round(abs / min)}m`;
  }
  if (abs < day) {
    return `${Math.round(abs / hour)}h`;
  }
  return `${Math.round(abs / day)}d`;
}
