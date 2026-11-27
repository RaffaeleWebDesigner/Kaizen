import { db, type Challenge, type Exercise, type SkipCategory, type Success } from './db';
import { toISO, todayISO } from './lib/dates';

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

// ---------- v3: obiettivi, sfide nuove, primi successi ----------

export const V3_CHALLENGES: Omit<Challenge, 'id' | 'builtin'>[] = [
  {
    name: 'Il nemico n.1',
    description: 'Per una settimana, nei giorni di palestra niente videogiochi finché la seduta non è fatta. Prima il bilanciere, poi la console.',
    duration: 'week',
  },
  {
    name: 'Ritorno immediato',
    description: 'Il giorno dopo una seduta saltata fai almeno la seduta minima. Non si lasciano due giorni di fila al nemico.',
    duration: 'day',
  },
  {
    name: 'Telefono in un’altra stanza',
    description: 'La seduta intera senza telefono: recuperi a orologio, niente notifiche, solo tu e i pesi. Annota tutto alla fine.',
    duration: 'day',
  },
  {
    name: 'Cinque minuti di plank',
    description: '300 secondi totali di plank in una seduta, in serie da 45-60 secondi. Ti fermi prima che la schiena ceda e recuperi quanto serve.',
    duration: 'day',
  },
  {
    name: 'Cento piegamenti',
    description: '100 piegamenti in una seduta, divisi in quante serie servono. Ogni serie si chiude con 2 ripetizioni di margine.',
    duration: 'day',
  },
  {
    name: 'Due settimane perfette',
    description: 'Due Settimane perfette di fila: tutte le sedute previste e tutti gli impegni di calcio, nessuna seduta saltata. Disponibile dopo 12 settimane di progetto.',
    duration: 'week',
    spanWeeks: 2,
    minWeeks: 12,
  },
];

async function addOnce(s: Omit<Success, 'id' | 'createdAt'>) {
  if (s.autoKey && (await db.successes.where('autoKey').equals(s.autoKey).count())) return;
  await db.successes.add({ ...s, createdAt: Date.now() });
}

/** Successo per la lettera del giorno 1 (una volta sola). */
export async function addLetterSuccess(at: number) {
  await addOnce({ date: toISO(new Date(at)), title: 'Lettera del giorno 1 scritta', description: 'Un messaggio al me di domani, per i giorni no.', category: 'vita', source: 'manual', autoKey: 'starter:letter' });
}

/**
 * Aggiornamento alla v3: aggiunge le sfide nuove e i primi successi.
 * Non tocca sedute, misure o altri dati. Gira una volta sola (flag v3done).
 */
export async function ensureV3(): Promise<void> {
  if (await db.settings.get('v3done')) return;
  await db.transaction('rw', [db.settings, db.challenges, db.successes, db.sessions, db.measurements, db.dayMarks], async () => {
    if (await db.settings.get('v3done')) return;

    const existing = await db.challenges.toArray();
    for (const c of V3_CHALLENGES) {
      if (!existing.some((x) => x.name === c.name)) await db.challenges.add({ ...c, builtin: true });
    }

    const done = (await db.sessions.toArray()).filter((s) => s.status === 'done').sort((a, b) => a.date.localeCompare(b.date));
    const first = done[0];
    if (first) {
      await addOnce({ date: first.date, title: 'Prima seduta del progetto', description: 'Il primo passo del Metodo Kaizen.', category: 'palestra', source: 'manual', autoKey: 'starter:first-session', claim: { type: 'seduta', date: first.date } });
    }
    const sick = (await db.dayMarks.where('type').equals('sick').toArray()).map((m) => m.date).sort();
    if (sick.length) {
      const sickDay = sick[0];
      const back = done.find((s) => s.date > sickDay);
      await addOnce({
        date: back?.date ?? todayISO(), title: 'Ripartito dopo la malattia', description: back ? 'Fermo per malattia, poi di nuovo in palestra.' : undefined,
        category: 'palestra', source: 'manual', autoKey: 'starter:back-after-sick', claim: { type: 'ripresa', date: sickDay },
      });
    }
    const m = (await db.measurements.toArray()).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (m) {
      await addOnce({ date: m.date, title: 'Prima misurazione completa', description: 'Il punto di partenza: da qui si guarda la direzione.', category: 'vita', source: 'manual', autoKey: 'starter:first-measure', claim: { type: 'misura', date: m.date } });
    }
    const letter = (await db.settings.get('letterOriginal'))?.value as { at: number } | undefined;
    if (letter?.at) await addLetterSuccess(letter.at);
    await addOnce({ date: todayISO(), title: 'Mi sono costruito un’app tutta mia per allenarmi', category: 'vita', source: 'manual', autoKey: 'starter:app' });

    await db.settings.put({ key: 'v3done', value: true });
  });
}
