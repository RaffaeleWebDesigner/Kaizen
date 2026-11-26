import type { Exercise, ExerciseLog, Session, Target } from '../db';
import { diffDays } from './dates';
import { fmtNum, roundToStep } from './units';

export interface RowLike {
  sets: number;
  repMin: number;
  repMax: number;
  startLoad: number;
}

type ExLike = Pick<Exercise, 'type' | 'increment' | 'stackStep' | 'bodyweight' | 'unit'>;

/** Ultimo registro di un esercizio nelle sedute fatte (ordinate dalla più recente). */
export function lastLogOf(history: Session[], exerciseId: number, beforeDate?: string): { log: ExerciseLog; session: Session } | null {
  for (const s of history) {
    if (s.status !== 'done') continue;
    if (beforeDate && s.date >= beforeDate) continue;
    const log = s.exercises.find((e) => e.exerciseId === exerciseId && e.sets.length > 0);
    if (log) return { log, session: s };
  }
  return null;
}

export const RESTART_GAP_DAYS = 7;

/**
 * Logica Kaizen: progressione minima, mai salti.
 * history: sedute (qualsiasi stato) ordinate dalla più recente.
 */
export function suggestTarget(row: RowLike, ex: ExLike, exerciseId: number, history: Session[], today: string): Target {
  const done = history.filter((s) => s.status === 'done' && s.date <= today);
  const prev = lastLogOf(done, exerciseId, undefined);
  const sets = row.sets;
  const step = ex.stackStep || ex.increment;
  const unit = ex.type === 'time' ? 's' : ex.unit;

  if (!prev) {
    return {
      sets,
      reps: row.repMin,
      load: row.startLoad,
      kind: 'first',
      message: 'Prima volta: parti dal minimo della fascia e tieni 2-3 ripetizioni di margine.',
    };
  }

  const { log } = prev;
  const doneSets = log.sets.filter((s) => s.done);
  const ref = doneSets.length ? doneSets : log.sets;
  const load = Math.max(...ref.map((s) => s.load));
  const level = Math.min(...ref.map((s) => s.reps));
  const lastGym = done[0]?.date ?? prev.session.date;
  const gap = diffDays(today, lastGym);

  if (log.pain) {
    return {
      sets,
      reps: level,
      load,
      kind: 'pain',
      message: "Nessuna progressione: l'ultima volta hai segnato dolore. Se torna, fermati e sostituisci l'esercizio.",
    };
  }

  if (gap > RESTART_GAP_DAYS) {
    let newLoad = load;
    let newReps = level;
    if (ex.type === 'time') {
      newReps = Math.max(row.repMin, roundToStep(level * 0.9, 5));
    } else if (ex.bodyweight && load === 0) {
      newReps = Math.max(1, level - 1);
    } else {
      newLoad = Math.max(0, roundToStep(load * 0.9, step));
    }
    return {
      sets,
      reps: newReps,
      load: newLoad,
      kind: 'restart',
      message:
        newLoad === load && newReps === level
          ? `Bentornato. Sei stato fermo ${gap} giorni: stesso carico (non si scende di meno di un blocco), ma tieni 3 ripetizioni di margine.`
          : `Bentornato. Sei stato fermo ${gap} giorni, quindi oggi un po' più leggero (circa -10%). Contava presentarsi, e l'hai fatto.`,
    };
  }

  const target = log.target;
  const completed =
    log.sets.length > 0 &&
    log.sets.every((s) => s.done) &&
    (!target || log.sets.every((s) => s.reps >= target.reps)) &&
    log.sets.length >= Math.min(sets, target?.sets ?? sets);

  if (!completed) {
    return { sets, reps: level, load, kind: 'same', message: 'Serie non tutte completate: stesso obiettivo della volta scorsa, senza fretta.' };
  }
  if (log.rir === null || log.rir === undefined) {
    return { sets, reps: level, load, kind: 'same', message: 'RIR non segnato la volta scorsa: stesso obiettivo. Segnalo oggi e la prossima si sale.' };
  }
  if (log.rir < 2) {
    return { sets, reps: level, load, kind: 'same', message: 'RIR sotto 2 la volta scorsa: stesso obiettivo, con più margine.' };
  }
  if (level < row.repMax) {
    return { sets, reps: level + 1, load, kind: 'reps', message: '+1 ripetizione per serie. Un passo piccolo, tutto qui.' };
  }
  if (ex.type === 'time' || (ex.bodyweight && ex.increment <= 0)) {
    return {
      sets,
      reps: row.repMax,
      load,
      kind: 'top',
      message: 'Sei in cima alla fascia: tieni così e valuta col coach una variante un filo più difficile.',
    };
  }
  return {
    sets,
    reps: row.repMin,
    load: Math.round((load + step) * 100) / 100,
    kind: 'load',
    message: `Fascia completata: +${fmtNum(step, 2)} ${unit}${ex.stackStep ? ' (1 blocco)' : ''} e si riparte da ${row.repMin} ripetizioni.`,
  };
}
