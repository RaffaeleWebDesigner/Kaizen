import { describe, expect, it } from 'vitest';
import type { DayMark, Exercise, ExerciseLog, Goal, Session } from '../db';
import { compareAgo, neverTwiceReason, nextSessionMilestone, planFor, planSentence, weeklyShareText, whatsappUrl } from './consistency';
import { buildIcsPlans } from './ics';
import { coachGoals, goalProgress, makeGoal, type GoalCtx } from './goals';
import { DEFAULT_SETTINGS, type AppSettings } from './settings';

const settings: AppSettings = { ...DEFAULT_SETTINGS, startDate: '2026-11-16', gymDays: [0, 3], dayPlans: [{ day: 0, time: '19:00', cue: 'appena torno dal lavoro, scendo in palestra' }] };
const traz: Exercise = { id: 2, name: 'Trazioni alla sbarra', group: 'tirata', type: 'reps', unit: 'kg', bodyweight: true, isBarbell: false, barWeight: null, perHand: false, increment: 0, stackStep: null, restSec: 120, cues: [], substituteIds: [], rankKey: 'trazioni' };
const log = (ex: Exercise, reps: number[], load = 0): ExerciseLog => ({
  uid: 'x', exerciseId: ex.id!, name: ex.name, group: ex.group, type: ex.type, unit: ex.unit, bodyweight: ex.bodyweight, isBarbell: ex.isBarbell, barWeight: null,
  perHand: false, increment: 0, stackStep: null, repMin: 3, repMax: 8, restSec: 90, cues: [], sets: reps.map((r) => ({ reps: r, load, done: true })), rir: 2, pain: false, stopped: false, notes: '', target: null,
});
const ses = (date: string, logs: ExerciseLog[] = []): Session => ({ id: Math.random(), date, kind: 'A', status: 'done', startedAt: null, endedAt: null, durationMin: null, feeling: null, notes: '', exercises: logs });

describe('piano se... allora', () => {
  it('frase del giorno e giorni senza piano', () => {
    expect(planSentence(planFor(settings, '2026-11-30')!)).toBe('Alle 19:00, appena torno dal lavoro, scendo in palestra.');
    expect(planSentence(planFor(settings, '2026-11-30')!, true)).toBe('Lunedì alle 19:00, appena torno dal lavoro, scendo in palestra.');
    expect(planFor(settings, '2026-12-03')).toMatchObject({ time: settings.gymTime, cue: '' });
    expect(planFor(settings, '2026-12-01')).toBeNull();
  });
  it('.ics: un evento per giorno, con il piano e i caratteri protetti', () => {
    const ics = buildIcsPlans([{ day: 0, time: '19:00', cue: 'torno, poi; scendo' }, { day: 3, time: '07:30', cue: '' }], 45, 30, '2026-11-27');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20261130T190000');
    expect(ics).toContain('DTSTART:20261203T073000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(ics).toContain('torno\\, poi\\; scendo');
  });
});

describe('mai saltare due volte', () => {
  it('dopo una saltata o un giorno del piano vuoto, non dopo malattia', () => {
    const skip: DayMark[] = [{ id: 1, date: '2026-11-25', type: 'skipped' }];
    expect(neverTwiceReason([], skip, settings, '2026-11-26')).toContain('saltato');
    expect(neverTwiceReason([], [], settings, '2026-11-24')).toContain('giorno di palestra'); // lunedì 23 nel piano
    expect(neverTwiceReason([], [{ id: 2, date: '2026-11-23', type: 'sick' }], settings, '2026-11-24')).toBeNull();
    expect(neverTwiceReason([ses('2026-11-23')], [], settings, '2026-11-24')).toBeNull();
    expect(neverTwiceReason([], [], settings, '2026-11-25')).toBeNull(); // martedì non è nel piano
  });
});

describe('contatore, confronto e condivisione', () => {
  it('prossimo traguardo', () => {
    expect(nextSessionMilestone(3)).toBe(25);
    expect(nextSessionMilestone(25)).toBe(50);
  });
  it('un mese fa: miglior serie di allora e di adesso', () => {
    const h = [ses('2026-10-20', [log(traz, [5, 4])]), ses('2026-11-25', [log(traz, [7, 6])])];
    const r = compareAgo(h, '2026-11-27', 30);
    expect(r[0]).toMatchObject({ then: { reps: 5 }, now: { reps: 7 } });
  });
  it('messaggio di 3 righe per WhatsApp', () => {
    const t = weeklyShareText({ monday: '2026-11-23', done: 2, minima: 1, sick: 1, target: 2, ok: true, pct: 100, inProgress: false }, 12, 3, 'Panca 40 kg × 8', 'fare la minima nei giorni no');
    expect(t.split('\n')).toHaveLength(3);
    expect(whatsappUrl(t)).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});

describe('obiettivi nuovi', () => {
  const ctx = (sessions: Session[]): GoalCtx => ({
    sessions, marks: [], today: '2026-11-27', settings, exById: new Map([[2, traz]]), templates: [], ranks: [],
    measures: [{ id: 1, date: '2026-11-16', weight: 60, waist: 80 } as never],
  });
  it('10 trazioni di fila: conta la serie migliore, senza tetto della fascia', () => {
    const c = ctx([ses('2026-11-26', [log(traz, [7, 5, 4])])]);
    const g = { ...makeGoal({ kind: 'exercise', title: 'Prime 10 trazioni di fila', exerciseId: 2, sets: 1, targetReps: 10, target: 0 }, c), id: 1 } as Goal;
    expect(g.baseline).toBe(3);
    expect(goalProgress(g, c).next).toContain('1×8 a corpo libero');
  });
  it('sedute totali e proposte del coach', () => {
    const c = ctx([ses('2026-11-16'), ses('2026-11-26')]);
    const g = { kind: 'total', target: 100, status: 'active', title: '', createdAt: 0, createdOn: '2026-11-27', id: 2 } as Goal;
    expect(goalProgress(g, c)).toMatchObject({ pct: 2, currentText: '2 sedute fatte' });
    const coach = coachGoals(c, []);
    expect(coach.map((d) => d.kind)).toEqual(['exercise', 'ratio', 'streak', 'total', 'body']);
    expect(coach[4]).toMatchObject({ target: 77, perMonth: 1 });
    expect(coachGoals(c, [{ ...g }]).map((d) => d.kind)).not.toContain('total');
  });
});

describe('tappe già superate alla partenza', () => {
  it('non finiscono nel barattolo', () => {
    const ctxR = {
      sessions: [], marks: [], today: '2026-11-27', settings, exById: new Map(), templates: [], measures: [],
      ranks: [{ key: 'panca', index: 0.64, bw: 59, e1rm: 38, best: { loadKg: 30, reps: 8, rir: 2, date: '2026-11-26', zavorraKg: 0 } } as never],
    } as GoalCtx;
    const g = { ...makeGoal({ kind: 'ratio', title: '', rankKey: 'panca', target: 1 }, ctxR), id: 9 } as Goal;
    expect(g.skipMs).toContain('q2');
    expect(goalProgress(g, ctxR).milestones.map((m) => m.key)).toEqual(['q3']);
  });
});
