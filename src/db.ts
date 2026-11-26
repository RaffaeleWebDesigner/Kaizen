import Dexie, { type Table } from 'dexie';

export type MuscleGroup = 'gambe' | 'spinta' | 'tirata' | 'core';
export type Unit = 'kg' | 'lb';
export type ExerciseType = 'reps' | 'time';
export type SessionKind = 'A' | 'B' | 'C' | 'MIN' | 'FREE';

export interface Exercise {
  id?: number;
  name: string;
  group: MuscleGroup;
  type: ExerciseType; // 'time' = le "ripetizioni" sono secondi
  unit: Unit;
  bodyweight: boolean; // corpo libero: il carico è zavorra aggiuntiva
  isBarbell: boolean;
  barWeight: number | null; // nell'unità dell'esercizio, sommato ai dischi
  perHand: boolean; // carico indicato per mano/manubrio
  increment: number; // aumento minimo di carico (o secondi per gli esercizi a tempo)
  stackStep: number | null; // peso di un blocco del pacco (macchine)
  restSec: number;
  cues: string[]; // 1-2 indicazioni tecniche
  substituteIds: number[];
  archived?: boolean;
}

export interface TemplateRow {
  exerciseId: number;
  sets: number;
  repMin: number;
  repMax: number;
  startLoad: number;
  restSec: number;
}

export interface Template {
  id?: number;
  code: Exclude<SessionKind, 'FREE'>;
  name: string;
  rows: TemplateRow[];
}

export interface SetLog {
  reps: number; // secondi per esercizi a tempo
  load: number; // dischi/manubrio/pacco, senza bilanciere
  done: boolean;
}

export interface Target {
  sets: number;
  reps: number;
  load: number;
  message: string;
  kind: 'first' | 'reps' | 'load' | 'same' | 'pain' | 'restart' | 'top';
}

export interface ExerciseLog {
  uid: string;
  exerciseId: number;
  name: string;
  group: MuscleGroup;
  type: ExerciseType;
  unit: Unit;
  bodyweight: boolean;
  isBarbell: boolean;
  barWeight: number | null;
  perHand: boolean;
  increment: number;
  stackStep: number | null;
  repMin: number;
  repMax: number;
  restSec: number;
  cues: string[];
  sets: SetLog[];
  rir: number | null;
  pain: boolean;
  stopped: boolean;
  notes: string;
  target: Target | null;
}

export interface Session {
  id?: number;
  date: string; // YYYY-MM-DD locale
  kind: SessionKind;
  status: 'in_progress' | 'done';
  startedAt: number | null;
  endedAt: number | null;
  durationMin: number | null;
  feeling: number | null; // 1-5
  notes: string;
  exercises: ExerciseLog[];
}

export type DayMarkType = 'skipped' | 'sick' | 'training_cancelled';

export interface DayMark {
  id?: number;
  date: string;
  type: DayMarkType;
  plannedKind?: SessionKind | null;
  reason?: string;
}

export interface Match {
  id?: number;
  date: string;
  time: string; // HH:MM
  venue: 'casa' | 'trasferta' | null;
  opponent?: string;
}

export interface Measurement {
  id?: number;
  date: string;
  weight?: number | null;
  bmi?: number | null;
  fatPct?: number | null;
  leanMass?: number | null;
  subcutFatPct?: number | null;
  visceralFat?: number | null;
  waterPct?: number | null;
  skeletalMusclePct?: number | null;
  muscleMass?: number | null;
  boneMass?: number | null;
  proteinPct?: number | null;
  bmr?: number | null;
  waist?: number | null;
  chest?: number | null;
  arm?: number | null;
  thigh?: number | null;
}

export interface Review {
  id?: number;
  type: 'weekly' | 'monthly';
  periodStart: string; // lunedì della settimana o inizio del blocco di 4 settimane
  createdAt: number;
  worked?: string;
  blocked?: string;
  difficulty?: 'facile' | 'giusta' | 'dura' | null;
  change?: string;
  note?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export class KaizenDB extends Dexie {
  settings!: Table<Setting, string>;
  exercises!: Table<Exercise, number>;
  templates!: Table<Template, number>;
  sessions!: Table<Session, number>;
  dayMarks!: Table<DayMark, number>;
  matches!: Table<Match, number>;
  measurements!: Table<Measurement, number>;
  reviews!: Table<Review, number>;

  constructor() {
    super('kaizen');
    this.version(1).stores({
      settings: 'key',
      exercises: '++id, name, group',
      templates: '++id, &code',
      sessions: '++id, date, kind, status',
      dayMarks: '++id, date, type',
      matches: '++id, date',
      measurements: '++id, date',
      reviews: '++id, type, periodStart',
    });
  }
}

export const db = new KaizenDB();

export const TABLES = [
  'settings',
  'exercises',
  'templates',
  'sessions',
  'dayMarks',
  'matches',
  'measurements',
  'reviews',
] as const;

export const KIND_LABEL: Record<SessionKind, string> = {
  A: 'Seduta A',
  B: 'Seduta B',
  C: 'Seduta C',
  MIN: 'Seduta minima',
  FREE: 'Seduta libera',
};

export const GROUP_LABEL: Record<MuscleGroup, string> = {
  gambe: 'Gambe',
  spinta: 'Spinta',
  tirata: 'Tirata',
  core: 'Core',
};
