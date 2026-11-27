import { useEffect, useState } from 'react';
import { Button, Card, Field, Header, NumInput, inputCls, toast } from '../components/ui';
import { setSetting, useSettings, type DayPlan } from '../lib/settings';
import { DAY_SHORT_LIST, dayName } from '../lib/dates';
import { buildIcsPlans } from '../lib/ics';
import { planSentence } from '../lib/consistency';
import { download } from '../lib/exportData';

export default function RemindersPage() {
  const s = useSettings();
  const [days, setDays] = useState<number[] | null>(null);
  const [time, setTime] = useState('18:30');
  const [dur, setDur] = useState<number | null>(45);
  const [alert, setAlert] = useState<number | null>(30);
  const [plans, setPlans] = useState<DayPlan[]>([]);
  useEffect(() => {
    if (s && days === null) {
      setDays(s.gymDays);
      setTime(s.gymTime);
      setPlans(s.dayPlans);
      setDur(s.gymDurationMin);
      setAlert(s.alertMin);
    }
  }, [s, days]);
  if (!s || days === null) return null;
  const planOf = (d: number): DayPlan => plans.find((p) => p.day === d) ?? { day: d, time, cue: '' };
  const setPlan = (d: number, patch: Partial<DayPlan>) => setPlans([...plans.filter((p) => p.day !== d), { ...planOf(d), ...patch }]);
  const savePlans = async () => {
    const list = days.map(planOf);
    await setSetting('gymDays', days);
    await setSetting('dayPlans', list);
    if (list[0]) await setSetting('gymTime', list[0].time);
    await setSetting('gymDurationMin', dur ?? 45);
    await setSetting('alertMin', alert ?? 30);
    return list;
  };

  const make = async (share: boolean) => {
    if (!days.length) return toast('Scegli almeno un giorno');
    const list = await savePlans();
    const ics = buildIcsPlans(list, dur ?? 45, alert ?? 30);
    const file = new File([ics], 'kaizen-palestra.ics', { type: 'text/calendar' });
    if (share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Promemoria palestra' });
        return;
      } catch {
        /* annullato: si scarica */
      }
    }
    download('kaizen-palestra.ics', ics, 'text/calendar');
    toast('File calendario scaricato');
  };

  return (
    <div className="pb-nav">
      <Header title="Promemoria" back="/altro" />
      <div className="p-4 space-y-3">
        <Card>
          <p className="text-sm text-muted mb-3">Niente notifiche dall’app: crei un file calendario con i tuoi giorni di palestra e lo importi nel calendario del telefono. Ti avvisa lui, anche ad app chiusa.</p>
          <span className="block text-sm text-muted mb-1">Giorni di palestra</span>
          <div className="grid grid-cols-7 gap-1 mb-3">
            {DAY_SHORT_LIST.map((d, i) => (
              <button key={d} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())}
                className={`h-12 rounded-xl border text-sm ${days.includes(i) ? 'bg-accent text-black border-accent font-bold' : 'bg-surface2 border-line'}`}>{d}</button>
            ))}
          </div>
          {days.length > 0 && (
            <div className="space-y-3 mb-3">
              <p className="text-sm text-muted">Il tuo piano "se... allora": quando e dove inizi. Più è preciso, più è facile partire.</p>
              {days.map((d) => {
                const p = planOf(d);
                return (
                  <div key={d} className="rounded-xl border border-line p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold capitalize flex-1">{dayName(`2026-11-${16 + d}`)}</span>
                      <input type="time" aria-label={`Ora ${DAY_SHORT_LIST[d]}`} className={`${inputCls} w-32`} value={p.time} onChange={(e) => setPlan(d, { time: e.target.value })} />
                    </div>
                    <input className={inputCls} aria-label={`Piano ${DAY_SHORT_LIST[d]}`} placeholder="appena torno dal lavoro, scendo in palestra" value={p.cue} onChange={(e) => setPlan(d, { cue: e.target.value })} />
                    <p className="text-xs text-muted mt-1">{planSentence(p, true)}</p>
                  </div>
                );
              })}
              <Button className="w-full" onClick={async () => { await savePlans(); toast('Piano salvato'); }}>Salva il piano</Button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Field label="Ora nuovi giorni">
              <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="Durata (min)">
              <NumInput value={dur} onChange={setDur} />
            </Field>
            <Field label="Avviso (min prima)">
              <NumInput value={alert} onChange={setAlert} />
            </Field>
          </div>
          <div className="grid gap-2">
            <Button big variant="primary" onClick={() => make(true)}>Crea e apri il file calendario</Button>
            <Button onClick={() => make(false)}>Scarica il file .ics</Button>
          </div>
          <p className="text-xs text-muted mt-2">I giorni e il piano compaiono anche nel banner "Oggi è giorno di palestra" nella Home. Ogni giorno diventa un evento con la sua ora e il suo piano.</p>
        </Card>

        <Card>
          <h2 className="font-bold mb-2">Come importarlo</h2>
          <p className="font-semibold text-sm">iPhone</p>
          <ol className="text-sm text-muted list-decimal ml-5 mb-3 space-y-1">
            <li>Tocca "Crea e apri il file calendario" e scegli <b className="text-ink">Calendario</b>, oppure apri il file scaricato da File → Download.</li>
            <li>Tocca <b className="text-ink">Aggiungi tutto</b> e scegli il calendario.</li>
            <li>Controlla in Impostazioni → Calendario che le notifiche siano attive.</li>
          </ol>
          <p className="font-semibold text-sm">Android</p>
          <ol className="text-sm text-muted list-decimal ml-5 mb-3 space-y-1">
            <li>Scarica il file e aprilo dalle notifiche o da File → Download.</li>
            <li>Scegli <b className="text-ink">Google Calendar</b> (o il calendario del telefono) e tocca <b className="text-ink">Importa</b> / Salva.</li>
            <li>Se non si apre: su un computer vai su calendar.google.com → Impostazioni → Importa ed esporta → scegli il file.</li>
          </ol>
          <p className="font-semibold text-sm">Se cambi giorni o orario</p>
          <p className="text-sm text-muted">Prima elimina gli eventi "Palestra – Metodo Kaizen" dal calendario (scegli "tutti gli eventi futuri"), poi rigenera e reimporta il file, così non hai doppioni.</p>
        </Card>
      </div>
    </div>
  );
}
