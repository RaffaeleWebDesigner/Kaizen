import { db, TABLES, KIND_LABEL, type Session, type DayMark } from '../db';
import { fmtDate, mondayOf, addDays, todayISO } from './dates';
import { fmtLoad, fmtNum, totalLoad } from './units';
import { setSetting } from './settings';

export const BACKUP_VERSION = 1;

export async function exportAll(): Promise<string> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await (db as any)[t].toArray();
  return JSON.stringify({ app: 'metodo-kaizen', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data }, null, 2);
}

export async function importAll(json: string): Promise<void> {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'metodo-kaizen' || !parsed.data) throw new Error('Il file non sembra un backup di Metodo Kaizen.');
  await db.transaction('rw', TABLES.map((t) => (db as any)[t]), async () => {
    for (const t of TABLES) {
      await (db as any)[t].clear();
      const rows = parsed.data[t];
      if (Array.isArray(rows) && rows.length) await (db as any)[t].bulkAdd(rows);
    }
    await db.settings.put({ key: 'seeded', value: true });
  });
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadBackup() {
  download(`kaizen-backup-${todayISO()}.json`, await exportAll(), 'application/json');
  await setSetting('lastBackupAt', Date.now());
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV con separatore ";" (si apre bene in Excel italiano). Una riga per serie. */
export async function sessionsCSV(): Promise<string> {
  const sessions = (await db.sessions.toArray()).filter((s) => s.status === 'done').sort((a, b) => a.date.localeCompare(b.date));
  const head = ['data', 'seduta', 'durata_min', 'voto', 'esercizio', 'gruppo', 'serie', 'ripetizioni_o_secondi', 'carico', 'unita', 'peso_bilanciere', 'carico_totale', 'fatta', 'rir', 'dolore', 'note_esercizio', 'note_seduta'];
  const lines = [head.join(';')];
  for (const s of sessions) {
    for (const e of s.exercises) {
      e.sets.forEach((set, i) => {
        lines.push([
          s.date, KIND_LABEL[s.kind], s.durationMin ?? '', s.feeling ?? '', e.name, e.group, i + 1, set.reps,
          String(set.load).replace('.', ','), e.unit, e.isBarbell ? e.barWeight ?? '' : '', String(totalLoad(e, set.load)).replace('.', ','),
          set.done ? 'sì' : 'no', e.rir ?? '', e.pain ? 'sì' : 'no', e.notes, s.notes,
        ].map(csvCell).join(';'));
      });
    }
  }
  return lines.join('\n');
}

function sessionMarkdown(s: Session): string {
  const out: string[] = [];
  const meta = [s.durationMin ? `${s.durationMin} min` : null, s.feeling ? `voto ${s.feeling}/5` : null].filter(Boolean).join(', ');
  out.push(`### ${KIND_LABEL[s.kind]} · ${fmtDate(s.date)}${meta ? ` (${meta})` : ''}`);
  for (const e of s.exercises) {
    const sets = e.sets
      .map((x) => `${e.type === 'time' ? `${x.reps}"` : x.reps}${fmtLoad(e, x.load) ? ` × ${fmtLoad(e, x.load)}` : ''}${x.done ? '' : ' (non fatta)'}`)
      .join(', ');
    const extras = [
      e.isBarbell ? (e.barWeight ? `bilanciere ${fmtNum(e.barWeight)} ${e.unit}` : 'peso bilanciere non inserito') : null,
      e.rir !== null ? `RIR ${e.rir}` : null,
      e.pain ? '⚠️ DOLORE' : null,
      e.stopped ? 'interrotto' : null,
    ].filter(Boolean).join(', ');
    out.push(`- **${e.name}**: ${sets || 'nessuna serie'}${extras ? ` (${extras})` : ''}${e.notes ? ` · _${e.notes}_` : ''}`);
  }
  if (s.notes) out.push(`- Note: ${s.notes}`);
  return out.join('\n');
}

export async function coachSummary(mode: 'last' | 'week', ref = todayISO()): Promise<string> {
  const sessions = (await db.sessions.toArray()).filter((s) => s.status === 'done').sort((a, b) => a.date.localeCompare(b.date));
  if (mode === 'last') {
    const last = sessions[sessions.length - 1];
    if (!last) return 'Nessuna seduta registrata.';
    return `## Ultima seduta\n\n${sessionMarkdown(last)}`;
  }
  const mon = mondayOf(ref);
  const sun = addDays(mon, 6);
  const inWeek = sessions.filter((s) => s.date >= mon && s.date <= sun);
  const marks: DayMark[] = (await db.dayMarks.toArray()).filter((m) => m.date >= mon && m.date <= sun).sort((a, b) => a.date.localeCompare(b.date));
  const out = [`## Settimana ${fmtDate(mon)} – ${fmtDate(sun)}`, '', `Sedute fatte: **${inWeek.length}**`, ''];
  for (const s of inWeek) out.push(sessionMarkdown(s), '');
  const skipped = marks.filter((m) => m.type === 'skipped');
  const sick = marks.filter((m) => m.type === 'sick');
  if (skipped.length) {
    out.push('### Sedute saltate');
    for (const m of skipped) out.push(`- ${fmtDate(m.date)}${m.plannedKind ? ` (${KIND_LABEL[m.plannedKind]})` : ''}: ${m.reason || 'motivo non scritto'}`);
    out.push('');
  }
  if (sick.length) {
    out.push('### Stop per malattia');
    for (const m of sick) out.push(`- ${fmtDate(m.date)}`);
    out.push('');
  }
  const review = await db.reviews.where('periodStart').equals(mon).filter((r) => r.type === 'weekly').first();
  if (review) {
    out.push('### Revisione');
    if (review.worked) out.push(`- Ha funzionato: ${review.worked}`);
    if (review.blocked) out.push(`- Mi ha bloccato: ${review.blocked}`);
    if (review.difficulty) out.push(`- Sedute: ${review.difficulty}`);
    if (review.change) out.push(`- Cambio: ${review.change}`);
  }
  return out.join('\n').trim();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
