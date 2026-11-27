import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Card, Chips, Field, Header, inputCls, toast } from '../components/ui';
import { db, type Review } from '../db';
import { useData } from '../lib/useData';
import { addDays, diffDays, fmtDate, mondayOf, todayISO } from '../lib/dates';
import { BLOCK_DAYS, blockRange } from './MonthlyReview';
import { streak, weekStats } from '../lib/stats';
import { weeklyShareText, whatsappUrl } from '../lib/consistency';
import { SKIP_CATEGORY_LABEL } from '../db';

export default function ReviewsPage() {
  const data = useData();
  const [sp] = useSearchParams();
  const today = todayISO();
  const defaultWeek = sp.get('settimana') ?? (diffDays(today, mondayOf(today)) >= 5 ? mondayOf(today) : addDays(mondayOf(today), -7));
  const [week, setWeek] = useState(defaultWeek);
  const reviews = useLiveQuery(() => db.reviews.toArray(), []);
  const [form, setForm] = useState<Review | null>(null);
  const [details, setDetails] = useState(false);
  const prs = useLiveQuery(() => db.successes.where('source').equals('pr').toArray(), []);

  useEffect(() => {
    if (!reviews) return;
    const ex = reviews.find((r) => r.type === 'weekly' && r.periodStart === week);
    setForm(ex ?? { type: 'weekly', periodStart: week, createdAt: Date.now(), worked: '', blocked: '', difficulty: null, change: '' });
  }, [reviews, week]);

  if (!data || !reviews || !form || !prs) return null;
  const startMon = mondayOf(data.settings.startDate);
  const weeks = weekStats(data.sessions, data.marks, data.settings.startDate, today, data.settings.weeklyGoal);
  const ws = weeks.find((w) => w.monday === week);
  const blocks = Math.floor(diffDays(today, data.settings.startDate) / BLOCK_DAYS);
  const weekly = reviews.filter((r) => r.type === 'weekly').sort((a, b) => b.periodStart.localeCompare(a.periodStart));

  const end = addDays(week, 6);
  const weekPrs = prs.filter((x) => x.date >= week && x.date <= end);
  const skipped = data.marks.filter((m) => m.type === 'skipped' && m.date >= week && m.date <= end);
  const totalDone = data.sessions.filter((x) => x.status === 'done').length;
  const st = streak(weeks.filter((w) => w.monday <= week));
  const record = weekPrs[0] ? `${weekPrs[0].title.replace(/^Record: /, '')} ${weekPrs[0].description ?? ''}`.trim() : null;
  const showDetails = details || !!(form.worked || form.blocked || form.difficulty);

  const save = async () => {
    if (form.id) await db.reviews.put(form);
    else await db.reviews.add(form);
    toast('Revisione salvata');
  };

  return (
    <div className="pb-nav">
      <Header title="Revisioni" back="/altro" />
      <div className="p-4 space-y-3">
        <Card>
          <div className="flex items-center justify-between mb-2">
            <button className="w-11 h-11 text-xl text-muted disabled:opacity-30" disabled={week <= startMon} onClick={() => setWeek(addDays(week, -7))} aria-label="Settimana precedente">‹</button>
            <div className="text-center">
              <div className="font-bold">Settimana {fmtDate(week)} – {fmtDate(addDays(week, 6))}</div>
              {ws && <div className="text-xs text-muted">{ws.done}/{ws.target} sedute</div>}
            </div>
            <button className="w-11 h-11 text-xl text-muted disabled:opacity-30" disabled={week >= mondayOf(today)} onClick={() => setWeek(addDays(week, 7))} aria-label="Settimana successiva">›</button>
          </div>
          <div className="rounded-xl bg-surface2 p-3 mb-3 text-sm space-y-1">
            <div>🏋️ Sedute fatte: <b>{ws?.done ?? 0}/{ws?.target ?? 0}</b>{ws?.minima ? ` (di cui ${ws.minima} minime)` : ''}</div>
            <div>🏆 Record: {weekPrs.length ? weekPrs.map((x) => `${x.title.replace(/^Record: /, '')} ${x.description ?? ''}`).join(' · ') : <span className="text-muted">nessuno questa settimana</span>}</div>
            <div>⏭️ Saltate: {skipped.length ? skipped.map((m) => `${fmtDate(m.date)}${m.category ? ` (${SKIP_CATEGORY_LABEL[m.category].toLowerCase()})` : ''}`).join(', ') : <span className="text-muted">nessuna</span>}</div>
          </div>
          <Field label="Una cosa da migliorare la settimana prossima (piccola)">
            <textarea className={`${inputCls} py-2`} value={form.change ?? ''} onChange={(e) => setForm({ ...form, change: e.target.value })} />
          </Field>
          {!showDetails && <button className="text-sm text-muted mb-3 min-h-[40px]" onClick={() => setDetails(true)}>+ Aggiungi dettagli (cosa ha funzionato, cosa ti ha bloccato)</button>}
          {showDetails && <>
          <Field label="Cosa ha funzionato?">
            <textarea className={`${inputCls} py-2`} value={form.worked ?? ''} onChange={(e) => setForm({ ...form, worked: e.target.value })} />
          </Field>
          <Field label="Cosa mi ha bloccato?">
            <textarea className={`${inputCls} py-2`} value={form.blocked ?? ''} onChange={(e) => setForm({ ...form, blocked: e.target.value })} />
          </Field>
          <div className="mb-3">
            <span className="block text-sm text-muted mb-1">Le sedute erano…</span>
            <Chips options={[{ value: 'facile', label: 'Facili' }, { value: 'giusta', label: 'Giuste' }, { value: 'dura', label: 'Dure' }]} value={form.difficulty ?? null} onChange={(d) => setForm({ ...form, difficulty: d as Review['difficulty'] })} />
            {form.difficulty === 'dura' && <p className="text-xs text-minima mt-1">Se erano dure, la prossima settimana tieni più margine. Non serve stringere i denti.</p>}
          </div>
          </>}
          <Button big variant="primary" className="w-full" onClick={save}>Salva revisione</Button>
          {ws && (
            <a className="mt-2 flex items-center justify-center gap-2 rounded-2xl min-h-[48px] bg-surface2 border border-line" target="_blank" rel="noreferrer"
              href={whatsappUrl(weeklyShareText(ws, totalDone, st, record, form.change ?? ''))} onClick={() => { save(); }}>
              💬 Manda al compagno di costanza (WhatsApp)
            </a>
          )}
        </Card>

        <h2 className="font-bold pt-2">Punto del mese</h2>
        {blocks < 1 ? (
          <p className="text-sm text-muted">Il primo arriva dopo 4 settimane, il {fmtDate(addDays(data.settings.startDate, BLOCK_DAYS))}.</p>
        ) : (
          Array.from({ length: blocks }, (_, i) => blocks - i).map((n) => {
            const r = blockRange(data.settings.startDate, n);
            return (
              <Link key={n} to={`/revisioni/mese/${n}`} className="block">
                <Card className="p-3 flex justify-between"><span>Mese {n}: {fmtDate(r.from)} – {fmtDate(r.to)}</span><span className="text-accent">›</span></Card>
              </Link>
            );
          })
        )}

        {weekly.length > 0 && <h2 className="font-bold pt-2">Revisioni passate</h2>}
        {weekly.map((r) => (
          <button key={r.id} className="w-full text-left" onClick={() => setWeek(r.periodStart)}>
            <Card className="p-3">
              <div className="font-semibold">Settimana {fmtDate(r.periodStart)}{r.difficulty ? ` · ${r.difficulty}` : ''}</div>
              {r.change && <div className="text-sm text-muted">Cambio: {r.change}</div>}
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
