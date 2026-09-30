import { ScheduleSettings, Weekday } from '../types';

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const toMinutes = (hhmm?: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

// Next time the queue opens according to the opening hours (null if unknown/disabled).
export const nextOpening = (schedule: ScheduleSettings | undefined, from = new Date()): Date | null => {
  if (!schedule?.enabled || !schedule.days) return null;
  for (let offset = 0; offset < 8; offset += 1) {
    const day = new Date(from);
    day.setDate(from.getDate() + offset);
    const config = schedule.days[WEEKDAYS[day.getDay()]];
    const open = toMinutes(config?.open);
    if (!config?.enabled || open === null) continue;
    const candidate = new Date(day);
    candidate.setHours(Math.floor(open / 60), open % 60, 0, 0);
    if (candidate > from) return candidate;
  }
  return null;
};

export const formatOpening = (date: Date, language: 'en' | 'no') => {
  const locale = language === 'en' ? 'en-GB' : 'nb-NO';
  const today = new Date();
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return time;
  return `${date.toLocaleDateString(locale, { weekday: 'long' })} ${time}`;
};
