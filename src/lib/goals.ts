import { db, type DayMark, type Exercise, type Goal, type Measurement, type Session, type Template } from '../db';
import { addDays, mondayOf, todayISO } from './dates';
import { exerciseLogs, levelOf } from './stall';
import { fmtNum } from './units';
import { streak, weekStats } from './stats';
import { computeRanks, levelName, RANK_EXERCISE_LABEL, type RankResult } from './rank';
import { getSettings, type AppSettings } from './settings';
import { nextPlatesTotal, plateTotals } from './plates';
import { rowFor, withBar } from './sessionUtils';

export const MAX_ACTIVE_GOALS = 3;
export const STREAK_MILESTONES = [4, 8, 12, 26, 52];
const SESSION_MILESTONES_FOR_GOALS = [10, 25, 50, 100, 150, 200, 365, 500];
const HABIT_MILESTONES = [2, 4, 8, 12, 26];
/** Ritmo sano massimo per il peso: oltre è un salto, non Kaizen. */
export const MAX_WEIGHT_PER_WEEK = 0.5;

export const GOAL_KIND_LABEL: Record<Goal['kind'], string> = {
  streak: 'Costanza',
  exercise: 'Esercizio',
  rank: 'Rank',
  body: 'Corpo',
  habit: 'Abitudine',
  total: 'Sedute totali',
  ratio: 'Forza / peso',
};

export interface GoalCtx {
  sessions: Session[];
  marks: DayMark[];
  exById: Map<number, Exercise>;
  templates: Template[];
  measures: Measurement[];
  settings: AppSettings;
  ranks: RankResult[];
  today: string;
}

export interface Milestone {
  key: string;
  label: string;
  reached: boolean;
}

export interface GoalProgress {
  currentText: string;
  targetText: string;
  pct: number; // 0-100
  done: boolean;
  next: string | null;
  eta: string | null;
  milestones: Milestone[];
}

export async function loadGoalCtx(today = todayISO()): Promise<GoalCtx> {
  const [sessions, marks, exercises, templates, measures, settings] = await Promise.all([
    db.sessions.toArray(), db.dayMarks.toArray(), db.exercises.toArray(), db.templates.toArray(), db.measurements.toArray(), getSettings(),
  ]);
  const exById = new Map(exercises.map((e) => [e.id!, e]));
  const { ranks } = computeRanks(sessions, exById, measures, settings.rankThresholds, today);
  return { sessions, marks, exById, templates, measures, settings, ranks, today };
}

const quarters = (pct: number): Milestone[] => [
  { key: 'q1', label: 'Un quarto di strada', reached: pct >= 25 },
  { key: 'q2', label: 'Metà strada', reached: pct >= 50 },
  { key: 'q3', label: 'Tre quarti di strada', reached: pct >= 75 },
];

const clampPct = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

// ---------- costanza ----------

export function currentStreak(ctx: GoalCtx): number {
  return streak(weekStats(ctx.sessions, ctx.marks, ctx.settings.startDate, ctx.today, ctx.settings.weeklyGoal));
}

/** Settimane chiuse di fila (dalla creazione) con almeno una seduta e nessuna seduta saltata. */
export function habitWeeks(ctx: GoalCtx, since: string): number {
  const weeks = weekStats(ctx.sessions, ctx.marks, ctx.settings.startDate, ctx.today, ctx.settings.weeklyGoal)
    .filter((w) => !w.inProgress && w.monday >= mondayOf(since));
  let n = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i];
    const end = addDays(w.monday, 6);
    const skipped = ctx.marks.some((m) => m.type === 'skipped' && m.date >= w.monday && m.date <= end);
    if (w.done >= 1 && !skipped) n++;
    else break;
  }
  return n;
}

function countMilestones(list: number[], target: number, current: number, unit: (n: number) => string): Milestone[] {
  return list.filter((m) => m < target).map((m) => ({ key: `w${m}`, label: unit(m), reached: current >= m }));
}

// ---------- esercizio ----------

interface ExPlan {
  ex: Exercise;
  offset: number; // peso del bilanciere da sommare al carico segnato
  sets: number;
  cur: { load: number; reps: number } | null;
  steps: { load: number; reps: number }[]; // tappe dalla situazione attuale al traguardo
}

function progressionTools(base: Exercise, ctx: GoalCtx) {
  const ex = withBar(base, ctx.settings);
  const tplRow = ctx.templates.flatMap((t) => t.rows).find((r) => r.exerciseId === ex.id);
  const row = rowFor(ex, tplRow);
  const offset = ex.isBarbell && ex.barWeight ? ex.barWeight : 0;
  const totals = ex.isBarbell && ex.unit === 'kg' ? plateTotals(ctx.settings.plates) : null;
  const repStep = ex.type === 'time' ? Math.max(1, ex.increment || 5) : 1;
  const nextLoad = (l: number): number | null => {
    if (ex.type === 'time') return null;
    if (totals && totals.length > 1) return nextPlatesTotal(l, totals);
    if (ex.stackStep) return Math.round((l + ex.stackStep) * 100) / 100;
    if (ex.increment > 0) return Math.round((l + ex.increment) * 100) / 100;
    return null;
  };
  const logs = exerciseLogs(ctx.sessions, ex.id!);
  const last = logs[logs.length - 1];
  const cur = last ? levelOf(last.log) : null;
  return { ex, row, offset, repStep, nextLoad, cur };
}

/** Il prossimo passo naturale della progressione (carico totale e ripetizioni): proposta di default. */
export function nextNaturalStep(base: Exercise, ctx: GoalCtx): { load: number; reps: number } {
  const { row, offset, repStep, nextLoad, cur } = progressionTools(base, ctx);
  if (!cur) return { load: row.startLoad + offset, reps: row.repMax };
  if (cur.reps + repStep <= row.repMax) return { load: cur.load + offset, reps: cur.reps + repStep };
  const nl = nextLoad(cur.load);
  return nl === null ? { load: cur.load + offset, reps: cur.reps + repStep } : { load: nl + offset, reps: row.repMin };
}

/** Miglior serie singola dell'ultima seduta (per gli obiettivi "di fila"). */
function bestSingleSet(ctx: GoalCtx, exId: number): { load: number; reps: number } | null {
  const logs = exerciseLogs(ctx.sessions, exId);
  const last = logs[logs.length - 1];
  if (!last) return null;
  const sets = last.log.sets.filter((x) => x.done);
  if (!sets.length) return null;
  return sets.reduce((a, x) => (x.load > a.load || (x.load === a.load && x.reps > a.reps) ? { load: x.load, reps: x.reps } : a), { load: -1, reps: 0 });
}

function exercisePlan(goal: Goal, ctx: GoalCtx): ExPlan | null {
  const base = goal.exerciseId ? ctx.exById.get(goal.exerciseId) : undefined;
  if (!base) return null;
  const t = progressionTools(base, ctx);
  const { ex, offset, repStep, nextLoad } = t;
  const single = goal.sets === 1;
  const cur = single ? bestSingleSet(ctx, ex.id!) : t.cur;
  // per una serie sola si sale di ripetizioni fino al traguardo, senza tetto della fascia
  const row = single ? { ...t.row, repMax: Math.max(t.row.repMax, goal.targetReps ?? 0) } : t.row;
  const targetLoad = goal.target - offset;
  const targetReps = goal.targetReps ?? row.repMin;
  const reached = (l: number, r: number) => l > targetLoad + 1e-9 || (l >= targetLoad - 1e-9 && r >= targetReps);
  let load = cur?.load ?? row.startLoad;
  let reps = cur?.reps ?? row.repMin;
  const steps: { load: number; reps: number }[] = [];
  if (!cur) steps.push({ load, reps });
  while (!reached(load, reps) && steps.length < 300) {
    const nl = load < targetLoad - 1e-9 ? nextLoad(load) : null;
    if (reps + repStep <= row.repMax || nl === null) reps += repStep;
    else {
      load = nl;
      reps = row.repMin;
    }
    steps.push({ load, reps });
  }
  return { ex, offset, sets: goal.sets ?? row.sets, cur, steps };
}

function fmtLevel(p: ExPlan, sets: number, l: { load: number; reps: number }) {
  const { ex } = p;
  const reps = ex.type === 'time' ? `${l.reps}"` : `${l.reps}`;
  const tot = l.load + p.offset;
  const load = ex.bodyweight && l.load === 0 ? ' a corpo libero' : tot > 0 ? ` × ${fmtNum(tot, 2)} ${ex.unit}${ex.bodyweight ? ' di zavorra' : ''}` : '';
  return `${sets}×${reps}${load}`;
}

function exerciseFreqPerWeek(ctx: GoalCtx, exId: number): number {
  const from = addDays(ctx.today, -27);
  const n = ctx.sessions.filter((s) => s.status === 'done' && s.date >= from && s.exercises.some((e) => e.exerciseId === exId && e.sets.length)).length;
  return Math.max(0.5, n / 4);
}

/** Numero di tappe dalla situazione attuale (salvato alla creazione per misurare la strada fatta). */
export function exerciseStepsNow(goal: Goal, ctx: GoalCtx): number {
  return exercisePlan(goal, ctx)?.steps.length ?? 0;
}

// ---------- calcolo ----------

export function goalProgress(goal: Goal, ctx: GoalCtx): GoalProgress {
  const p = rawProgress(goal, ctx);
  if (!goal.skipMs?.length) return p;
  return { ...p, milestones: p.milestones.filter((m) => !goal.skipMs!.includes(m.key)) };
}

function rawProgress(goal: Goal, ctx: GoalCtx): GoalProgress {
  const closed = goal.status === 'done';
  switch (goal.kind) {
    case 'streak': {
      const cur = currentStreak(ctx);
      const done = closed || cur >= goal.target;
      return {
        currentText: `${cur} ${cur === 1 ? 'settimana' : 'settimane'} di fila`,
        targetText: `${goal.target} settimane di fila con almeno 2 sedute`,
        pct: done ? 100 : clampPct((cur / goal.target) * 100),
        done,
        next: done ? null : `Settimana n. ${cur + 1}: almeno 2 sedute (o la minima nei giorni no).`,
        eta: done ? null : `${goal.target - cur} ${goal.target - cur === 1 ? 'settimana' : 'settimane'}, una alla volta.`,
        milestones: countMilestones(STREAK_MILESTONES, goal.target, cur, (m) => `${m} settimane di fila`),
      };
    }
    case 'habit': {
      const cur = habitWeeks(ctx, goal.createdOn);
      const done = closed || cur >= goal.target;
      return {
        currentText: `${cur} ${cur === 1 ? 'settimana' : 'settimane'} senza sedute saltate`,
        targetText: `${goal.target} settimane in cui nei giorni no fai la minima invece di saltare`,
        pct: done ? 100 : clampPct((cur / goal.target) * 100),
        done,
        next: done ? null : 'Questa settimana: nessuna seduta saltata. Se è un giorno no, bastano 15 minuti di minima.',
        eta: done ? null : `${goal.target - cur} ${goal.target - cur === 1 ? 'settimana' : 'settimane'}.`,
        milestones: countMilestones(HABIT_MILESTONES, goal.target, cur, (m) => `${m} settimane senza saltare`),
      };
    }
    case 'exercise': {
      const p = exercisePlan(goal, ctx);
      if (!p) return { currentText: 'esercizio non trovato', targetText: '', pct: 0, done: closed, next: null, eta: null, milestones: [] };
      const sets = p.sets;
      const left = p.steps.length;
      const total = Math.max(goal.baseline ?? left, left, 1);
      const done = closed || left === 0;
      const pct = done ? 100 : clampPct(((total - left) / total) * 100);
      const unit = p.ex.unit;
      const targetText = `${sets}×${p.ex.type === 'time' ? `${goal.targetReps}"` : goal.targetReps}${goal.target > 0 ? ` × ${fmtNum(goal.target, 2)} ${unit}${p.ex.bodyweight ? ' di zavorra' : ''}` : p.ex.bodyweight ? ' a corpo libero' : ''}`;
      const f = exerciseFreqPerWeek(ctx, p.ex.id!);
      const weeks = Math.ceil(left / f);
      return {
        currentText: p.cur ? `ora ${fmtLevel(p, sets, p.cur)}` : 'non ancora fatto',
        targetText,
        pct,
        done,
        next: done ? null : `Prossima tappa: ${fmtLevel(p, sets, p.steps[0])}${p.steps[0].load !== p.cur?.load && p.cur ? ' (il salto più piccolo)' : ''}.`,
        eta: done ? null : `Almeno ${left} ${left === 1 ? 'seduta riuscita' : 'sedute riuscite'} con RIR ≥ 2, circa ${weeks} ${weeks === 1 ? 'settimana' : 'settimane'} al tuo ritmo. Senza fretta: conta la direzione.`,
        milestones: total >= 4 ? quarters(pct) : [],
      };
    }
    case 'rank': {
      const r = ctx.ranks.find((x) => x.key === goal.rankKey);
      const level = r?.level ?? 0;
      const start = goal.baseline ?? Math.max(0, goal.target - 1);
      const done = closed || level >= goal.target;
      const span = Math.max(1, goal.target - start);
      const pct = done ? 100 : clampPct(((level - start + (r?.progress ?? 0)) / span) * 100);
      return {
        currentText: r ? `ora ${levelName(level)}` : 'nessuna serie valida nelle ultime 4 settimane',
        targetText: `${RANK_EXERCISE_LABEL[goal.rankKey!]}: ${levelName(goal.target)}`,
        pct,
        done,
        next: done ? null : r?.toNext ? `Prossima tappa: ${r.toNext}. Ci arrivi con la progressione normale.` : 'Allenalo nelle sedute normali: il rank si calcola da solo.',
        eta: null,
        milestones: goal.target - start > 1 ? Array.from({ length: goal.target - start - 1 }, (_, i) => start + i + 1).map((lv) => ({ key: `l${lv}`, label: levelName(lv), reached: level >= lv })) : [],
      };
    }
    case 'total': {
      const cur = ctx.sessions.filter((s) => s.status === 'done').length;
      const done = closed || cur >= goal.target;
      const perWeek = Math.max(1, ctx.settings.weeklyGoal);
      const weeks = Math.ceil((goal.target - cur) / perWeek);
      return {
        currentText: `${cur} sedute fatte`,
        targetText: `${goal.target} sedute totali`,
        pct: done ? 100 : clampPct((cur / goal.target) * 100),
        done,
        next: done ? null : `Prossima tappa: seduta n. ${cur + 1}. Anche la minima conta.`,
        eta: done ? null : `Al ritmo di ${perWeek} a settimana: circa ${weeks} ${weeks === 1 ? 'settimana' : 'settimane'}.`,
        milestones: SESSION_MILESTONES_FOR_GOALS.filter((m) => m < goal.target).map((m) => ({ key: `s${m}`, label: `${m} sedute`, reached: cur >= m })),
      };
    }
    case 'ratio': {
      const r = ctx.ranks.find((x) => x.key === goal.rankKey);
      const idx = r?.index ?? 0;
      const done = closed || idx >= goal.target - 1e-9;
      const name = RANK_EXERCISE_LABEL[goal.rankKey!];
      let next: string | null = null;
      if (!done) {
        if (!r) next = 'Allenalo nelle sedute normali (serie da 1 a 10 ripetizioni): il massimale si stima da solo.';
        else {
          const need = goal.target * r.bw;
          const f = 1 + (r.best.reps + (r.best.rir ?? 0)) / 30;
          const kgMore = Math.max(0.5, Math.ceil((need / f - r.best.loadKg) * 2) / 2);
          next = `Massimale stimato ${fmtNum(r.e1rm)} kg, il traguardo è ${fmtNum(need)} kg: circa +${fmtNum(kgMore)} kg sulla tua serie migliore (${r.best.reps} rip.). Ci arrivi un disco alla volta.`;
        }
      }
      return {
        currentText: r ? `ora ${fmtNum(idx, 2)} volte il peso corporeo` : 'nessuna serie valida nelle ultime 4 settimane',
        targetText: `${name}: ${fmtNum(goal.target, 2)} volte il peso corporeo (stimato, mai test di massimale)`,
        pct: done ? 100 : clampPct((idx / goal.target) * 100),
        done,
        next,
        eta: null,
        milestones: quarters(done ? 100 : clampPct((idx / goal.target) * 100)).slice(1),
      };
    }
    case 'body': {
      const metric = goal.metric ?? 'weight';
      const unit = metric === 'weight' ? 'kg' : 'cm';
      const name = metric === 'weight' ? 'Peso' : 'Vita';
      const list = ctx.measures.filter((m) => typeof m[metric] === 'number').sort((a, b) => a.date.localeCompare(b.date));
      const cur = list.length ? (list[list.length - 1][metric] as number) : null;
      const base = goal.baseline ?? cur ?? goal.target;
      const dir = Math.sign(goal.target - base) || 1;
      const doneNow = cur !== null && (dir > 0 ? cur >= goal.target : cur <= goal.target);
      const done = closed || doneNow;
      const pct = done ? 100 : cur === null || goal.target === base ? 0 : clampPct(((cur - base) / (goal.target - base)) * 100);
      const ref = cur ?? base;
      const nextVal = dir > 0 ? Math.floor(ref) + 1 : Math.ceil(ref) - 1;
      const left = Math.abs(goal.target - ref);
      const weeks = metric === 'weight' ? Math.ceil(left / MAX_WEIGHT_PER_WEEK) : null;
      const months = goal.perMonth ? Math.ceil(left / goal.perMonth) : null;
      return {
        currentText: cur === null ? 'nessuna misura' : `ora ${fmtNum(cur)} ${unit}`,
        targetText: `${name} ${fmtNum(goal.target)} ${unit} (da ${fmtNum(base)})`,
        pct,
        done,
        next: done ? null : `Prossima tappa: ${fmtNum(dir > 0 ? Math.min(nextVal, goal.target) : Math.max(nextVal, goal.target))} ${unit}. Guarda la media di più misure, non il singolo giorno.`,
        eta: done ? null : months !== null
          ? `Ritmo di riferimento: ${fmtNum(goal.perMonth!)} ${unit} al mese, circa ${months} ${months === 1 ? 'mese' : 'mesi'}. È una bussola, non una scadenza.`
          : weeks === null ? null : `Con un ritmo sano (al massimo ${fmtNum(MAX_WEIGHT_PER_WEEK)} kg a settimana): almeno ${weeks} ${weeks === 1 ? 'settimana' : 'settimane'}.`,
        milestones: quarters(pct),
      };
    }
  }
}

// ---------- proposte ----------

export type GoalDraft = Omit<Goal, 'id' | 'createdAt' | 'createdOn' | 'status'>;

export function goalTitle(d: GoalDraft, exById: Map<number, Exercise>): string {
  switch (d.kind) {
    case 'streak':
      return `Striscia di ${d.target} settimane`;
    case 'habit':
      return `${d.target} settimane senza saltare`;
    case 'rank':
      return `${RANK_EXERCISE_LABEL[d.rankKey!]}: ${levelName(d.target)}`;
    case 'body':
      return `${d.metric === 'waist' ? 'Vita' : 'Peso'} ${fmtNum(d.target)} ${d.metric === 'waist' ? 'cm' : 'kg'}`;
    case 'total':
      return `${d.target} sedute totali`;
    case 'ratio':
      return `${RANK_EXERCISE_LABEL[d.rankKey!]}: ${fmtNum(d.target, 2)} × peso corporeo`;
    case 'exercise': {
      const ex = d.exerciseId ? exById.get(d.exerciseId) : undefined;
      const reps = ex?.type === 'time' ? `${d.targetReps}"` : `${d.targetReps}`;
      if (d.sets === 1 && ex?.bodyweight && d.target === 0) return `${ex.name}: ${reps} di fila`;
      return `${ex?.name ?? 'Esercizio'}: ${reps}${d.target > 0 ? ` × ${fmtNum(d.target, 2)} ${ex?.unit ?? 'kg'}` : ''}`;
    }
  }
}

export const sameGoal = (a: GoalDraft, b: GoalDraft) =>
  a.kind === b.kind && (
    a.kind === 'exercise' ? a.exerciseId === b.exerciseId && a.sets === b.sets
    : a.kind === 'rank' || a.kind === 'ratio' ? a.rankKey === b.rankKey
    : a.kind === 'body' ? a.metric === b.metric
    : a.target === b.target);

/** Tre proposte calcolate dai dati: striscia, rank panca, trazioni +1 ripetizione. */
export function suggestGoals(ctx: GoalCtx, active: Goal[]): GoalDraft[] {
  const out: GoalDraft[] = [];
  const s = currentStreak(ctx);
  out.push({ kind: 'streak', title: '', target: STREAK_MILESTONES.find((m) => m > s) ?? s + 4 });
  const panca = ctx.ranks.find((r) => r.key === 'panca');
  if (panca && panca.level < 23) out.push({ kind: 'rank', title: '', rankKey: 'panca', target: panca.level + 1, baseline: panca.level });
  const traz = [...ctx.exById.values()].find((e) => e.rankKey === 'trazioni' && !e.archived);
  if (traz) {
    const logs = exerciseLogs(ctx.sessions, traz.id!);
    const last = logs[logs.length - 1];
    if (last) {
      const lv = levelOf(last.log);
      out.push({ kind: 'exercise', title: '', exerciseId: traz.id, target: lv.load, targetReps: lv.reps + 1 });
    }
  }
  return out
    .filter((d) => !active.some((g) => (g.status === 'active' || g.status === 'queued') && sameGoal(g, d)))
    .map((d) => ({ ...d, title: goalTitle(d, ctx.exById) }));
}

/** I 5 obiettivi del coach: trazioni di fila, panca a peso corporeo, 12 settimane, 100 sedute, vita -3 cm. */
export function coachGoals(ctx: GoalCtx, existing: Goal[]): GoalDraft[] {
  const out: GoalDraft[] = [];
  const traz = [...ctx.exById.values()].find((e) => e.rankKey === 'trazioni' && !e.archived);
  if (traz) out.push({ kind: 'exercise', title: 'Prime 10 trazioni di fila', exerciseId: traz.id, sets: 1, targetReps: 10, target: 0 });
  out.push({ kind: 'ratio', title: 'Panca con il tuo peso corporeo', rankKey: 'panca', target: 1 });
  out.push({ kind: 'streak', title: '12 settimane di fila con almeno 2 sedute', target: 12 });
  out.push({ kind: 'total', title: '100 sedute totali', target: 100 });
  const waist = ctx.measures.filter((m) => typeof m.waist === 'number').sort((a, b) => a.date.localeCompare(b.date));
  if (waist.length) {
    const w = waist[waist.length - 1].waist as number;
    out.push({ kind: 'body', title: 'Girovita -3 cm', metric: 'waist', target: Math.round((w - 3) * 10) / 10, perMonth: 1 });
  }
  return out.filter((d) => !existing.some((g) => (g.status === 'active' || g.status === 'queued') && sameGoal(g, d)));
}

/** Prepara un obiettivo nuovo, con il punto di partenza per misurare la strada. */
export function makeGoal(d: GoalDraft, ctx: GoalCtx, status: 'active' | 'queued' = 'active'): Omit<Goal, 'id'> {
  const g: Omit<Goal, 'id'> = { ...d, title: d.title || goalTitle(d, ctx.exById), status, createdAt: Date.now(), createdOn: ctx.today };
  if (d.kind === 'exercise') g.baseline = exerciseStepsNow(g as Goal, ctx);
  if (d.kind === 'rank' && g.baseline === undefined) g.baseline = ctx.ranks.find((r) => r.key === d.rankKey)?.level ?? 0;
  if (d.kind === 'body' && g.baseline === undefined) {
    const metric = d.metric ?? 'weight';
    const list = ctx.measures.filter((m) => typeof m[metric] === 'number').sort((a, b) => a.date.localeCompare(b.date));
    g.baseline = list.length ? (list[list.length - 1][metric] as number) : undefined;
  }
  g.skipMs = reachedNow(g as Goal, ctx);
  return g;
}

/** Controlli Kaizen sulla proposta: niente salti. Ritorna un avviso o null. */
export function goalDraftProblem(d: GoalDraft, ctx: GoalCtx, activeCount: number): string | null {
  if (activeCount >= MAX_ACTIVE_GOALS) return `Al massimo ${MAX_ACTIVE_GOALS} obiettivi attivi: chiudine uno prima di aggiungerne un altro.`;
  if (!(d.target >= 0) || Number.isNaN(d.target)) return 'Inserisci un traguardo valido.';
  if (d.kind === 'exercise') {
    if (!d.exerciseId) return 'Scegli un esercizio.';
    if (!d.targetReps || d.targetReps < 1) return 'Inserisci le ripetizioni.';
  }
  if ((d.kind === 'rank' || d.kind === 'ratio') && !d.rankKey) return 'Scegli l’esercizio.';
  if (d.kind === 'ratio' && (d.target <= 0 || d.target > 3)) return 'Scegli un rapporto tra 0,1 e 3 volte il peso corporeo.';
  if (d.kind === 'total' && d.target < 1) return 'Almeno 1 seduta.';
  if ((d.kind === 'streak' || d.kind === 'habit') && d.target < 1) return 'Almeno 1 settimana.';
  if (d.kind === 'body') {
    const metric = d.metric ?? 'weight';
    const list = ctx.measures.filter((m) => typeof m[metric] === 'number');
    if (!list.length) return 'Prima registra una misura in Corpo: serve un punto di partenza.';
  }
  return null;
}

/** Tappe già superate adesso: non contano come conquiste dell'obiettivo. */
function reachedNow(g: Goal, ctx: GoalCtx): string[] {
  try {
    return rawProgress({ ...g, status: 'active' }, ctx).milestones.filter((m) => m.reached).map((m) => m.key);
  } catch {
    return [];
  }
}

/** Ricalcola il punto di partenza quando un obiettivo in coda diventa attivo. */
export function activateGoal(g: Goal, ctx: GoalCtx): Partial<Goal> {
  const fresh = makeGoal({ ...g, baseline: g.kind === 'body' ? undefined : g.baseline } as GoalDraft, ctx);
  const baseline = g.kind === 'rank' ? ctx.ranks.find((r) => r.key === g.rankKey)?.level ?? 0 : fresh.baseline;
  return { status: 'active', createdOn: ctx.today, baseline, skipMs: reachedNow({ ...g, baseline }, ctx) };
}
