export function formatDateTimeId(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeOnlyId(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnlyId(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function toLocalDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toLocalDateTimeInputValue(isoString?: string): string {
  const d = isoString ? new Date(isoString) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

export function getDataAgeInfo(
  isoString: string | null | undefined,
  staleThresholdMinutes: number
): {label: string; isStale: boolean; minutesOld: number | null} {
  if (!isoString) {
    return {label: 'Belum ada pembaruan', isStale: true, minutesOld: null};
  }
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) {
    return {label: 'Waktu tidak valid', isStale: true, minutesOld: null};
  }
  const diffMin = Math.max(0, Math.floor((Date.now() - time) / 60000));
  let ageText = '';
  if (diffMin < 1) {
    ageText = 'Baru saja';
  } else if (diffMin < 60) {
    ageText = `${diffMin} menit lalu`;
  } else {
    const hours = Math.floor(diffMin / 60);
    const remMin = diffMin % 60;
    ageText = remMin > 0 ? `${hours} jam ${remMin} menit lalu` : `${hours} jam lalu`;
  }
  return {
    label: ageText,
    isStale: diffMin >= staleThresholdMinutes,
    minutesOld: diffMin,
  };
}

export function isSameLocalDate(isoA: string, dateYmd: string): boolean {
  const d = new Date(isoA);
  if (Number.isNaN(d.getTime())) return false;
  return toLocalDateInputValue(d) === dateYmd;
}

export function downloadCsvFile(filename: string, headers: string[], rows: string[][]): void {
  const escapeCell = (cell: string) => {
    const s = String(cell ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join(
      '\r\n'
    );

  const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
