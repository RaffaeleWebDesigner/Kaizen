import { Card, Field, Header, NumInput, Stepper, inputCls } from '../components/ui';
import { setSetting, useSettings } from '../lib/settings';
import { LB_TO_KG, fmtNum } from '../lib/units';

export default function SettingsPage() {
  const s = useSettings();
  if (!s) return null;
  return (
    <div className="pb-nav">
      <Header title="Impostazioni" back="/altro" />
      <div className="p-4 space-y-3">
        <Card>
          <Field label="Inizio progetto">
            <input type="date" className={inputCls} value={s.startDate} onChange={(e) => e.target.value && setSetting('startDate', e.target.value)} />
          </Field>
          <Field label="Altezza (cm)" hint="Serve per calcolare il BMI se la bilancia non lo dà.">
            <NumInput value={s.heightCm} onChange={(v) => v && setSetting('heightCm', v)} />
          </Field>
          <div className="flex justify-between items-center">
            <span>Sedute previste a settimana</span>
            <Stepper value={s.weeklyGoal} min={1} onChange={(v) => setSetting('weeklyGoal', v)} />
          </div>
        </Card>
        <Card>
          <Field label="Lat machine: peso di ogni blocco (lb)" hint={`${fmtNum(s.lbPerBlock * LB_TO_KG)} kg. Usato quando crei un esercizio a pacco pesi in libbre.`}>
            <NumInput value={s.lbPerBlock} onChange={(v) => v && setSetting('lbPerBlock', v)} />
          </Field>
        </Card>
        <p className="text-xs text-muted text-center">Metodo Kaizen · i dati restano su questo dispositivo</p>
      </div>
    </div>
  );
}
