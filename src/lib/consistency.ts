import type { DayMark, Session } from '../db';
import { addDays, dayName, fmtDate, mondayOf, weekdayMon } from './dates';
import { fmtNum, totalLoad } from './units';
import type { AppSettings, DayPlan } from './settings';
import type { WeekStat } from './stats';

// ---------- piano "se... allora" ----------

export function planFor(settings: AppSettings, date: string): DayPlan | null {
  const day = weekdayMon(date);
  if (!settings.gymDays.includes(day)) return null;
  return settings.dayPlans.find((p) => p.day === day) ?? { day, time: settings.gymTime, cue: '' };
}

/** "Martedì alle 19:00, appena torno dal lavoro, scendo in palestra." */
export function planSentence(p: DayPlan, withDay = false): string {
  const when = `${withDay ? `${dayName(`2026-11-${16 + p.day}`)} ` : ''}alle ${p.time}`;
  const cue = p.cue.trim().replace(/[.\s]+$/, '');
  const s = cue ? `${when}, ${cue}.` : `${when}.`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- mai saltare due volte ----------

/**
 * Motivo per mostrare solo la seduta minima oggi: ieri seduta saltata,
 * oppure ieri era un giorno del piano senza seduta (malattia e allenamento annullato esclusi).
 */
export function neverTwiceReason(sessions: Session[], marks: DayMark[], settings: AppSettings, today: string): string | null {
  const y = addDays(today, -1);
  if (y < settings.startDate) return null;
  const doneY = sessions.some((s) => s.status === 'done' && s.date === y);
  if (doneY) return null;
  const marksY = marks.filter((m) => m.date === y);
  if (marksY.some((m) => m.type === 'sick')) return null;
  if (marksY.some((m) => m.type === 'skipped')) return 'Ieri hai saltato.';
  if (settings.gymDays.includes(weekdayMon(y))) return 'Ieri era giorno di palestra e non c’è una seduta.';
  return null;
}

// ---------- contatore sedute ----------

export const SESSION_MILESTONES = [25, 50, 100, 150, 200, 365, 500, 750, 1000];

export function nextSessionMilestone(count: number): number | null {
  return SESSION_MILESTONES.find((m) => m > count) ?? null;
}

// ---------- un mese fa / un anno fa ----------

export interface BestThen {
  exerciseId: number;
  name: string;
  unit: string;
  type: 'reps' | 'time';
  now: { load: number; reps: number; date: string };
  then: { load: number; reps: number; date: string } | null;
}

const better = (a: { load: number; reps: number }, b: { load: number; reps: number }) => a.load > b.load + 1e-9 || (Math.abs(a.load - b.load) < 1e-9 && a.reps > b.reps);

function bestIn(sessions: Session[], exId: number, from: string, to: string) {
  let best: { load: number; reps: number; date: string } | null = null;
  for (const s of sessions) {
    if (s.status !== 'done' || s.date < from || s.date > to) continue;
    for (const l of s.exercises.filter((e) => e.exerciseId === exId)) {
      for (const set of l.sets.filter((x) => x.done)) {
        const v = { load: totalLoad(l, set.load), reps: set.reps, date: s.date };
        if (!best || better(v, best)) best = v;
      }
    }
  }
  return best;
}

/**
 * Miglior serie delle ultime 4 settimane rispetto alla miglior serie di un periodo passato
 * (4 settimane che finiscono "daysAgo" giorni fa).
 */
export function compareAgo(sessions: Session[], today: string, daysAgo: number): BestThen[] {
  const ids = [...new Set(sessions.filter((s) => s.status === 'done').flatMap((s) => s.exercises.filter((e) => e.sets.some((x) => x.done)).map((e) => e.exerciseId)))];
  const out: BestThen[] = [];
  const thenTo = addDays(today, -daysAgo);
  for (const id of ids) {
    const now = bestIn(sessions, id, addDays(today, -27), today);
    if (!now) continue;
    const then = bestIn(sessions, id, addDays(thenTo, -27), thenTo);
    const ref = sessions.flatMap((s) => s.exercises).find((e) => e.exerciseId === id)!;
    out.push({ exerciseId: id, name: ref.name, unit: ref.unit, type: ref.type, now, then });
  }
  return out.sort((a, b) => Number(!!b.then) - Number(!!a.then) || a.name.localeCompare(b.name));
}

export function fmtBest(b: { load: number; reps: number }, unit: string, type: 'reps' | 'time') {
  if (type === 'time') return `${b.reps}"`;
  return b.load > 0 ? `${fmtNum(b.load, 2)} ${unit} × ${b.reps}` : `${b.reps} rip.`;
}

// ---------- compagno di costanza ----------

/** Riepilogo di 3 righe da mandare a un amico. */
export function weeklyShareText(week: WeekStat, total: number, streakWeeks: number, record: string | null, improve: string): string {
  const lines = [
    `💪 Metodo Kaizen, settimana del ${fmtDate(week.monday)}: ${week.done}/${week.target} sedute${week.minima ? ` (di cui ${week.minima} minime)` : ''}.`,
    `🔥 Striscia: ${streakWeeks} ${streakWeeks === 1 ? 'settimana' : 'settimane'} · sedute totali: ${total}${record ? ` · record: ${record}` : ''}.`,
    improve.trim() ? `🎯 La prossima settimana: ${improve.trim()}` : '🎯 La prossima settimana: presentarmi, un passo alla volta.',
  ];
  return lines.join('\n');
}

export function whatsappUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export const isSunday = (d: string) => mondayOf(d) === addDays(d, -6);
