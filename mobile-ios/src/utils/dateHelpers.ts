const MONTHS_TR = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

const MONTHS_FULL_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const DAYS_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function shiftYearMonth(ym: string, deltaMonths: number): string {
  const parts = (ym || '').split('-');
  const year = parseInt(parts[0] || '', 10) || new Date().getFullYear();
  const monthIdx = (parseInt(parts[1] || '', 10) || 1) - 1;
  const date = new Date(year, monthIdx + deltaMonths, 1);
  const nextY = date.getFullYear();
  const nextM = String(date.getMonth() + 1).padStart(2, '0');
  return `${nextY}-${nextM}`;
}

export function formatPackageMonthTr(ym?: string | null): string {
  if (!ym) return 'Dönem Belirtilmedi';
  const match = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!match) return ym;
  const year = parseInt(match[1], 10);
  const monthNum = parseInt(match[2], 10);
  if (!year || monthNum < 1 || monthNum > 12) return ym;
  return `${MONTHS_FULL_TR[monthNum - 1]} ${year}`;
}

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

export function getUpcomingIsoDates(count = 8): string[] {
  const result: string[] = [];
  const base = new Date();
  for (let i = 0; i < count; i += 1) {
    const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    result.push(`${y}-${m}-${d}`);
  }
  return result;
}

export function addMinutesToHhMm(hhmm: string, minutes = 60): string {
  const cleaned = (hhmm || '').trim().replace('.', ':');
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(cleaned);
  if (!match) return '';
  const totalMinutes = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = String(Math.floor(wrapped / 60)).padStart(2, '0');
  const m = String(wrapped % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function getDaysRemaining(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const today = toLocalMidnight(getTodayIso());
  const target = toLocalMidnight(dateStr);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
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
