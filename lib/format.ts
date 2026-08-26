export function formatDuration(totalSeconds: number, compact = false) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (compact) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function revisionLabel(number: number) {
  return number === 0 ? 'Initial' : `Revision ${number}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return 'running';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function liveSeconds(startedAt: string | null | undefined, now: number) {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
