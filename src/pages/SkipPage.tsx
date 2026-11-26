import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Chips, Field, Header, inputCls, toast } from '../components/ui';
import { db, type SessionKind } from '../db';
import { todayISO } from '../lib/dates';
import { SKIP_LINES, pick } from '../lib/texts';

const QUICK = ['Stanchezza', 'Poco sonno', 'Lavoro', 'Impegni', 'Pigrizia', 'Videogioco', 'Dolore'];

export default function SkipPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [date, setDate] = useState(sp.get('data') ?? todayISO());
  const [kind, setKind] = useState<SessionKind | null>(null);
  const [reason, setReason] = useState('');
  const [sick, setSick] = useState(false);

  const save = async () => {
    if (sick) {
      await db.dayMarks.add({ date, type: 'sick', reason: reason || 'Malattia' });
      toast('Stop per malattia segnato. Riposa.');
    } else {
      if (!reason.trim()) return toast('Scrivi il motivo, anche in due parole');
      await db.dayMarks.add({ date, type: 'skipped', plannedKind: kind, reason: reason.trim() });
      toast('Segnata. Si riparte dalla prossima.');
    }
    nav(-1);
  };

  return (
    <div className="pb-nav">
      <Header title="Seduta saltata" back />
      <div className="p-4 space-y-3">
        <Card className="border-line">
          <p className="font-semibold">Accountability mirror</p>
          <p className="text-sm text-muted">{pick(SKIP_LINES)}</p>
        </Card>
        <Field label="Giorno">
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Chips options={[{ value: 'skip', label: 'Saltata' }, { value: 'sick', label: '🤒 Malattia' }]} value={sick ? 'sick' : 'skip'} onChange={(v) => setSick(v === 'sick')} />
        {sick ? (
          <p className="text-sm text-muted">La malattia è giustificata: non conta come saltata e toglie una seduta dal previsto della settimana.</p>
        ) : (
          <>
            <Field label="Quale seduta era prevista?">
              <Chips options={(['A', 'B', 'C'] as const).map((k) => ({ value: k, label: k }))} value={kind} onChange={setKind} />
            </Field>
            <Field label="Motivo, detto onestamente">
              <textarea className={`${inputCls} py-2 min-h-[88px]`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cosa è successo?" />
            </Field>
            <div className="flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button key={q} type="button" className="min-h-[40px] px-3 rounded-full bg-surface2 border border-line text-sm" onClick={() => setReason(reason ? `${reason}, ${q.toLowerCase()}` : q)}>{q}</button>
              ))}
            </div>
          </>
        )}
        <Button big variant="primary" className="w-full" onClick={save}>Salva</Button>
        {!sick && <p className="text-xs text-muted text-center">Niente recuperi forzati: la prossima seduta resta quella prevista.</p>}
      </div>
    </div>
  );
}
