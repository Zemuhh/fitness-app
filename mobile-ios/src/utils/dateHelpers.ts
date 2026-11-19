const MONTHS_TR = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

const DAYS_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

function toLocalMidnight(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTomorrowIso(): string {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTurkishDateLabel(dateStr: string): {
  primary: string;
  secondary: string;
  full: string;
} {
  const todayStr = getTodayIso();
  const tomorrowStr = getTomorrowIso();
  const dt = toLocalMidnight(dateStr);
  const dayNum = dt.getDate();
  const monthName = MONTHS_TR[dt.getMonth()] || '';
  const dayName = DAYS_TR[dt.getDay()] || '';
  const shortDate = `${dayNum} ${monthName} ${dayName}`;

  if (dateStr === todayStr) {
    return { primary: 'Bugün', secondary: `${dayNum} ${monthName}`, full: `Bugün • ${shortDate}` };
  }
  if (dateStr === tomorrowStr) {
    return { primary: 'Yarın', secondary: `${dayNum} ${monthName}`, full: `Yarın • ${shortDate}` };
  }
  return { primary: `${dayNum} ${monthName}`, secondary: dayName, full: shortDate };
}
