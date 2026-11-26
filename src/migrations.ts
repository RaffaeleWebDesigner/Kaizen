import { db, type Exercise, type SkipCategory } from './db';

/** Classifica un motivo scritto a mano in una categoria. */
export function guessCategory(reason: string | undefined): SkipCategory {
  const r = (reason ?? '').toLowerCase();
  if (/videogioc|play|gioc|console|game/.test(r)) return 'videogiochi';
  if (/sonno|stanc|dormit|serata|sveglia/.test(r)) return 'sonno';
  if (/lavor|ufficio|turno/.test(r)) return 'lavoro';
  if (/impegn|famiglia|cena|viaggio|appuntament/.test(r)) return 'impegni';
  if (/pigriz|voglia|svogliat/.test(r)) return 'pigrizia';
  return 'altro';
}

const BUILTIN_CHALLENGES = [
  {
    name: 'Cento',
    description: '100 trazioni (o rematori) in una seduta, divise in quante serie servono. Ogni serie si chiude con 1-2 ripetizioni di margine. Tecnica pulita, ci si ferma col dolore.',
    duration: 'day' as const,
  },
  {
    name: 'Seduta nell’orario scomodo',
    description: 'La seduta completa appena sveglio, oppure alla fine di una giornata stancante. Stessi carichi di sempre, stesso margine.',
    duration: 'day' as const,
  },
  {
    name: 'Doppia minima',
    description: 'Seduta normale più seduta minima nello stesso giorno, separate da almeno 4 ore.',
    duration: 'day' as const,
  },
  {
    name: 'Settimana perfetta',
    description: '3 sedute su 3 più tutti gli impegni di calcio, senza nessuna seduta saltata.',
    duration: 'week' as const,
  },
];

const NEW_EXERCISES: Omit<Exercise, 'id'>[] = [
  {
    name: 'Stacco da terra', group: 'gambe', type: 'reps', unit: 'kg', bodyweight: false, isBarbell: true, barWeight: null,
    perHand: false, increment: 1, stackStep: null, restSec: 150, substituteIds: [], barId: 'stacchi', rankKey: 'stacco',
    cues: ['Bilanciere sopra il centro del piede, schiena neutra', 'Spingi il pavimento con le gambe, bilanciere vicino al corpo'],
  },
  {
    name: 'Military press con bilanciere', group: 'spinta', type: 'reps', unit: 'kg', bodyweight: false, isBarbell: true, barWeight: null,
    perHand: false, increment: 1, stackStep: null, restSec: 120, substituteIds: [], barId: 'military', rankKey: 'military',
    cues: ['Glutei e addome stretti, niente schiena arcuata', 'Il bilanciere sale in linea retta, testa che passa sotto'],
  },
];

/**
 * Aggiornamento alla v2: aggiunge solo ciò che manca, non cancella e non sovrascrive niente.
 * Si può chiamare a ogni avvio (è idempotente).
 */
export async function ensureV2(): Promise<void> {
  if (await db.settings.get('v2done')) return;
  await db.transaction('rw', [db.settings, db.exercises, db.dayMarks, db.challenges, db.sessions], async () => {
    if (await db.settings.get('v2done')) return;

    // sedute saltate: categoria dal motivo scritto
    const marks = await db.dayMarks.where('type').equals('skipped').toArray();
    for (const m of marks) if (!m.category) await db.dayMarks.update(m.id!, { category: guessCategory(m.reason) });

    // esercizi: collegamento a bilanciere e rank
    const exercises = await db.exercises.toArray();
    for (const e of exercises) {
      const patch: Partial<Exercise> = {};
      const n = e.name.toLowerCase();
      if (e.barId === undefined) patch.barId = e.isBarbell ? (n.includes('ez') ? 'ez' : n.includes('panca') ? 'panca' : n.includes('military') ? 'military' : n.includes('stacc') ? 'stacchi' : null) : null;
      if (e.rankKey === undefined) {
        patch.rankKey =
          n.includes('panca piana') && e.isBarbell ? 'panca'
          : n.startsWith('trazioni') ? 'trazioni'
          : n.startsWith('dip') ? 'dip'
          : null;
      }
      // con i dischi che hai il salto più piccolo sul bilanciere è 0,5 kg: lo calcola l'inventario
      if (e.isBarbell && e.unit === 'kg' && e.increment === 2.5) patch.increment = 1;
      if (Object.keys(patch).length) await db.exercises.update(e.id!, patch);
    }
    for (const ne of NEW_EXERCISES) {
      if (!exercises.some((e) => e.name === ne.name)) await db.exercises.add(ne);
    }

    // sfide precaricate
    const existing = await db.challenges.toArray();
    for (const c of BUILTIN_CHALLENGES) {
      if (!existing.some((x) => x.name === c.name)) await db.challenges.add({ ...c, builtin: true });
    }

    await db.settings.put({ key: 'v2done', value: true });
  });
}
