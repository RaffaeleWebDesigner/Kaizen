import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Card, Chips, Confirm, Field, Header, NumInput, Sheet, inputCls, toast } from '../components/ui';
import { db, type Goal, type GoalKind, type RankKey } from '../db';
import {
  GOAL_KIND_LABEL, MAX_ACTIVE_GOALS, coachGoals, goalDraftProblem, nextNaturalStep, goalProgress, goalTitle, loadGoalCtx, makeGoal, suggestGoals,
  type GoalCtx, type GoalDraft, type GoalProgress,
} from '../lib/goals';
import { exerciseLogs, levelOf } from '../lib/stall';
import { levelName, RANK_EXERCISE_LABEL } from '../lib/rank';
import { fmtDate } from '../lib/dates';
import { fmtNum } from '../lib/units';
import { syncDerived } from '../lib/derived';
import { withBar } from '../lib/sessionUtils';
import { SESSION_MILESTONES } from '../lib/consistency';
import { setSetting } from '../lib/settings';

function useGoals() {
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  // ricalcola quando cambiano sedute, misure o segni del calendario
  const ctx = useLiveQuery(() => loadGoalCtx(), []);
  return goals && ctx ? { goals, ctx } : null;
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 rounded-full bg-surface2 overflow-hidden">
      <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function RewardLine({ g }: { g: Goal }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(g.reward ?? '');
  if (edit) {
    return (
      <div className="flex gap-2 mt-2">
        <input className={inputCls} value={text} placeholder="es. una maglia nuova da allenamento" onChange={(e) => setText(e.target.value)} aria-label="Ricompensa" />
        <Button variant="primary" onClick={async () => { await db.goals.update(g.id!, { reward: text.trim() || undefined }); setEdit(false); }}>Ok</Button>
      </div>
    );
  }
  return (
    <button className="block w-full text-sm mt-2 min-h-[36px] text-left" onClick={() => setEdit(true)}>
      {g.reward ? <span>🎁 Patto: <b>{g.reward}</b></span> : <span className="text-muted">🎁 Aggiungi una ricompensa per questo traguardo</span>}
    </button>
  );
}

function GoalCard({ g, p, onArchive }: { g: Goal; p: GoalProgress; onArchive?: () => void }) {
  return (
    <Card className={g.status === 'done' ? 'border-accent/50' : ''}>
      <div className="flex justify-between gap-2 items-start">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">{GOAL_KIND_LABEL[g.kind]}</div>
          <div className="font-bold leading-tight">{g.status === 'done' ? '🎯 ' : ''}{g.title}</div>
        </div>
        <div className="text-accent font-bold tabular">{p.pct}%</div>
      </div>
      <div className="my-2"><Bar pct={p.pct} /></div>
      <p className="text-sm text-muted">{p.currentText} · traguardo {p.targetText}</p>
      {g.status === 'done' ? (
        <p className="text-sm text-accent mt-1">Raggiunto il {fmtDate(g.doneOn ?? g.createdOn)}.</p>
      ) : (
        <>
          {p.next && <p className="text-sm mt-2 font-semibold">{p.next}</p>}
          {p.eta && <p className="text-xs text-muted mt-1">{p.eta}</p>}
        </>
      )}
      {p.milestones.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {p.milestones.map((m) => (
            <span key={m.key} className={`text-[11px] rounded-full px-2 py-0.5 border ${m.reached ? 'border-accent text-accent bg-accent/10' : 'border-line text-muted'}`}>{m.reached ? '✓ ' : ''}{m.label}</span>
          ))}
        </div>
      )}
      {g.status !== 'done' ? <RewardLine g={g} /> : g.reward ? <p className="text-sm mt-2">🎁 Ricompensa sbloccata: <b>{g.reward}</b></p> : null}
      {onArchive && (g.status === 'active' || g.status === 'queued') && (
        <button className="block text-xs text-muted mt-1 min-h-[36px]" onClick={onArchive}>Metti da parte</button>
      )}
    </Card>
  );
}

/** Card compatta per Oggi: la prossima tappa del primo obiettivo attivo. */
export function GoalTodayCard() {
  const d = useGoals();
  if (!d) return null;
  const active = d.goals.filter((g) => g.status === 'active');
  if (!active.length) {
    return (
      <Link to="/obiettivi" className="block">
        <Card><div className="font-semibold">🎯 Scegli un obiettivo</div><div className="text-sm text-muted">Piccolo, a tappe, senza scadenze. Ne ho già pronti alcuni dai tuoi dati.</div></Card>
      </Link>
    );
  }
  const g = active[0];
  const p = goalProgress(g, d.ctx);
  return (
    <Link to="/obiettivi" className="block">
      <Card>
        <div className="flex justify-between gap-2">
          <div className="text-xs uppercase tracking-wide text-muted">Obiettivo{active.length > 1 ? ` · 1 di ${active.length}` : ''}</div>
          <div className="text-xs text-accent font-bold tabular">{p.pct}%</div>
        </div>
        <div className="font-semibold leading-tight">{g.title}</div>
        <div className="my-2"><Bar pct={p.pct} /></div>
        {p.next && <div className="text-sm text-muted">{p.next}</div>}
      </Card>
    </Link>
  );
}

export default function GoalsPage() {
  const d = useGoals();
  const [adding, setAdding] = useState(false);
  const [archive, setArchive] = useState<Goal | null>(null);
  if (!d) return null;
  const { goals, ctx } = d;
  const active = goals.filter((g) => g.status === 'active');
  const queued = goals.filter((g) => g.status === 'queued').sort((a, b) => a.createdAt - b.createdAt);
  const done = goals.filter((g) => g.status === 'done').sort((a, b) => (b.doneOn ?? '').localeCompare(a.doneOn ?? ''));
  const open = [...active, ...queued];
  const suggestions = active.length < MAX_ACTIVE_GOALS ? suggestGoals(ctx, open) : [];
  const coach = coachGoals(ctx, open);

  /** Se ci sono già 3 obiettivi attivi, il nuovo va nei "Prossimi". */
  const add = async (draft: GoalDraft, quiet = false) => {
    const nowActive = (await db.goals.where('status').equals('active').count());
    const problem = goalDraftProblem(draft, ctx, 0);
    if (problem) return toast(problem);
    const status = nowActive >= MAX_ACTIVE_GOALS ? 'queued' : 'active';
    await db.goals.add({ ...makeGoal(draft, ctx, status), createdAt: Date.now() + Math.random() });
    if (!quiet) toast(status === 'queued' ? 'Aggiunto ai prossimi: parte quando si libera un posto' : 'Obiettivo aggiunto');
    syncDerived();
  };

  return (
    <div className="pb-nav">
      <Header title="Obiettivi" back="/altro" />
      <div className="p-4 space-y-3">
        <Card className="text-sm text-muted">
          Al massimo {MAX_ACTIVE_GOALS} obiettivi alla volta. Ognuno si divide in tappe piccole (+1 ripetizione, il disco più piccolo, una settimana in più)
          e ogni tappa raggiunta va nel barattolo. Nessuna scadenza: conta la direzione, non la velocità.
        </Card>

        {active.length > 0 && <h2 className="font-bold pt-1">Attivi</h2>}
        {active.map((g) => <GoalCard key={g.id} g={g} p={goalProgress(g, ctx)} onArchive={() => setArchive(g)} />)}

        {queued.length > 0 && (
          <>
            <h2 className="font-bold pt-1">Prossimi</h2>
            <p className="text-xs text-muted -mt-2">Partono da soli, in quest’ordine, quando chiudi un obiettivo attivo.</p>
            {queued.map((g) => <GoalCard key={g.id} g={g} p={goalProgress(g, ctx)} onArchive={() => setArchive(g)} />)}
          </>
        )}

        {coach.length > 0 && (
          <Card>
            <div className="font-semibold">Obiettivi proposti dal coach</div>
            <ul className="text-sm text-muted list-disc ml-5 my-2 space-y-0.5">
              {coach.map((d) => <li key={d.title}>{d.title}</li>)}
            </ul>
            <Button variant="primary" className="w-full" onClick={async () => {
              for (const d of coach) await add(d, true);
              toast(`Aggiunti: i primi partono subito, gli altri sono nei prossimi`);
            }}>Aggiungi {coach.length === 1 ? 'questo' : `tutti e ${coach.length}`}</Button>
          </Card>
        )}

        {suggestions.length > 0 && (
          <>
            <h2 className="font-bold pt-1">Proposte dai tuoi dati</h2>
            {suggestions.map((s) => {
              const preview = goalProgress({ ...makeGoal(s, ctx), id: -1 }, ctx);
              return (
                <Card key={s.title} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="font-semibold leading-tight">{s.title}</div>
                    <div className="text-xs text-muted">{preview.next ?? preview.targetText}</div>
                  </div>
                  <Button variant="primary" onClick={() => add(s)}>Aggiungi</Button>
                </Card>
              );
            })}
          </>
        )}

        <Button big className="w-full" onClick={() => setAdding(true)}>+ Nuovo obiettivo</Button>
        {active.length >= MAX_ACTIVE_GOALS && <p className="text-xs text-muted text-center -mt-1">Hai {MAX_ACTIVE_GOALS} obiettivi attivi: i nuovi vanno nei prossimi.</p>}

        <SessionRewards ctx={ctx} />

        {done.length > 0 && <h2 className="font-bold pt-1">Raggiunti</h2>}
        {done.map((g) => <GoalCard key={g.id} g={g} p={goalProgress(g, ctx)} />)}
      </div>

      {adding && <NewGoalSheet ctx={ctx} onClose={() => setAdding(false)} onAdd={async (dr) => { await add(dr); setAdding(false); }} />}
      <Confirm open={!!archive} onClose={() => setArchive(null)} title="Mettere da parte l’obiettivo?" confirmLabel="Metti da parte"
        text="Le tappe già raggiunte restano nel barattolo. Puoi sceglierne uno nuovo quando vuoi."
        onConfirm={async () => { await db.goals.update(archive!.id!, { status: 'archived' }); toast('Obiettivo messo da parte'); syncDerived(); }} />
    </div>
  );
}

function NewGoalSheet({ ctx, onClose, onAdd }: { ctx: GoalCtx; onClose: () => void; onAdd: (d: GoalDraft) => void }) {
  const [kind, setKind] = useState<GoalKind>('exercise');
  const [weeks, setWeeks] = useState<number | null>(4);
  const exercises = [...ctx.exById.values()].filter((e) => !e.archived).sort((a, b) => a.name.localeCompare(b.name));
  const lastDone = ctx.sessions.filter((x) => x.status === 'done').sort((a, b) => b.date.localeCompare(a.date))[0]?.exercises.find((e) => e.sets.length)?.exerciseId;
  const [exId, setExId] = useState<number | null>(lastDone ?? exercises[0]?.id ?? null);
  const ex = exId ? ctx.exById.get(exId) : undefined;
  const exb = ex ? withBar(ex, ctx.settings) : undefined;
  const lastLevel = useMemo(() => {
    if (!ex) return null;
    const logs = exerciseLogs(ctx.sessions, ex.id!);
    return logs.length ? levelOf(logs[logs.length - 1].log) : null;
  }, [ex, ctx.sessions]);
  const natural = useMemo(() => (ex ? nextNaturalStep(ex, ctx) : null), [ex, ctx]);
  const offset = exb?.isBarbell && exb.barWeight ? exb.barWeight : 0;
  const [reps, setReps] = useState<number | null>(null);
  const [load, setLoad] = useState<number | null>(null);
  const [rankKey, setRankKey] = useState<RankKey>('panca');
  const curRank = ctx.ranks.find((r) => r.key === rankKey)?.level ?? 0;
  const [rankTarget, setRankTarget] = useState<number | null>(null);
  const [metric, setMetric] = useState<'weight' | 'waist'>('weight');
  const [bodyTarget, setBodyTarget] = useState<number | null>(null);
  const [single, setSingle] = useState(false);
  const [total, setTotal] = useState<number | null>(100);
  const [ratio, setRatio] = useState<number | null>(1);
  const [reward, setReward] = useState('');

  const draftReps = reps ?? natural?.reps ?? 8;
  const draftLoad = load ?? natural?.load ?? offset;
  const draft: GoalDraft = (() => {
    switch (kind) {
      case 'streak': return { kind, title: '', target: weeks ?? 0 };
      case 'habit': return { kind, title: '', target: weeks ?? 0 };
      case 'exercise': return { kind, title: '', exerciseId: exId ?? undefined, target: draftLoad, targetReps: draftReps, sets: single ? 1 : undefined };
      case 'total': return { kind, title: '', target: total ?? 0 };
      case 'ratio': return { kind, title: '', rankKey, target: ratio ?? 0 };
      case 'rank': return { kind, title: '', rankKey, target: rankTarget ?? Math.min(23, curRank + 1), baseline: curRank };
      case 'body': return { kind, title: '', metric, target: bodyTarget ?? NaN };
    }
  })();
  const problem = goalDraftProblem(draft, ctx, 0);
  const goal = problem ? null : { ...makeGoal(draft, ctx), id: -1 };
  const p = goal ? goalProgress(goal, ctx) : null;

  // avvisi Kaizen: traguardi troppo lontani si spezzano
  let warn: string | null = null;
  if (goal && kind === 'exercise' && (goal.baseline ?? 0) > 30) warn = `Sono ${goal.baseline} tappe: è lontano. Meglio un traguardo più vicino, poi il prossimo.`;
  if (kind === 'rank' && draft.target - curRank > 3) warn = 'Più di 3 livelli: meglio uno alla volta.';
  const curBody = (() => {
    const list = ctx.measures.filter((m) => typeof m[metric] === 'number').sort((a, b) => a.date.localeCompare(b.date));
    return list.length ? (list[list.length - 1][metric] as number) : null;
  })();
  if (kind === 'body' && curBody !== null && bodyTarget !== null && Math.abs(bodyTarget - curBody) > (metric === 'weight' ? 4 : 5)) {
    warn = metric === 'weight' ? 'Più di 4 kg: meglio tappe da 2-3 kg, una dopo l’altra.' : 'Più di 5 cm: meglio un traguardo più vicino.';
  }

  return (
    <Sheet open onClose={onClose} title="Nuovo obiettivo">
      <div className="space-y-3">
        <Chips<GoalKind> options={(Object.keys(GOAL_KIND_LABEL) as GoalKind[]).map((k) => ({ value: k, label: GOAL_KIND_LABEL[k] }))} value={kind} onChange={setKind} />

        {(kind === 'streak' || kind === 'habit') && (
          <Field label="Settimane" hint={kind === 'streak' ? 'Settimane di fila con almeno 2 sedute (o il previsto ridotto per malattia).' : 'Settimane con almeno una seduta e nessuna seduta saltata: nei giorni no si fa la minima.'}>
            <NumInput value={weeks} onChange={setWeeks} />
          </Field>
        )}

        {kind === 'exercise' && (
          <>
            <Field label="Esercizio">
              <select className={inputCls} value={exId ?? ''} onChange={(e) => { setExId(Number(e.target.value)); setReps(null); setLoad(null); }}>
                {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            {lastLevel && ex && <p className="text-xs text-muted -mt-1">Ultima volta: {ex.type === 'time' ? `${lastLevel.reps}"` : `${lastLevel.reps} rip.`}{lastLevel.load + offset > 0 ? ` × ${fmtNum(lastLevel.load + offset, 2)} ${ex.unit}` : ''}</p>}
            <Chips options={[{ value: 'n', label: 'Tutte le serie' }, { value: '1', label: 'Una serie (di fila)' }]} value={single ? '1' : 'n'} onChange={(v) => setSingle(v === '1')} />
            <div className="grid grid-cols-2 gap-2">
              <Field label={ex?.type === 'time' ? 'Secondi' : single ? 'Ripetizioni di fila' : 'Ripetizioni per serie'}>
                <NumInput value={draftReps} onChange={setReps} />
              </Field>
              {ex?.type !== 'time' && (
                <Field label={ex?.bodyweight ? `Zavorra (${ex.unit})` : `Carico totale (${ex?.unit ?? 'kg'})`} hint={offset ? `Bilanciere compreso (${fmtNum(offset)}).` : undefined}>
                  <NumInput value={draftLoad} onChange={setLoad} />
                </Field>
              )}
            </div>
          </>
        )}

        {kind === 'rank' && (
          <>
            <Chips<RankKey> options={(Object.keys(RANK_EXERCISE_LABEL) as RankKey[]).map((k) => ({ value: k, label: RANK_EXERCISE_LABEL[k] }))} value={rankKey} onChange={(k) => { setRankKey(k); setRankTarget(null); }} />
            <p className="text-xs text-muted">Ora: {curRank ? levelName(curRank) : 'nessun rank (servono serie da 1-10 ripetizioni nelle ultime 4 settimane)'}</p>
            <Field label="Livello da raggiungere">
              <select className={inputCls} value={draft.target} onChange={(e) => setRankTarget(Number(e.target.value))}>
                {Array.from({ length: 23 - curRank }, (_, i) => curRank + i + 1).map((lv) => <option key={lv} value={lv}>{levelName(lv)}</option>)}
              </select>
            </Field>
          </>
        )}

        {kind === 'total' && (
          <Field label="Sedute totali" hint={`Ne hai già fatte ${ctx.sessions.filter((x) => x.status === 'done').length}. Anche la minima conta.`}>
            <NumInput value={total} onChange={setTotal} />
          </Field>
        )}

        {kind === 'ratio' && (
          <>
            <Chips<RankKey> options={(Object.keys(RANK_EXERCISE_LABEL) as RankKey[]).map((k) => ({ value: k, label: RANK_EXERCISE_LABEL[k] }))} value={rankKey} onChange={setRankKey} />
            <Field label="Quante volte il peso corporeo" hint="Si misura sul massimale stimato dalle serie normali: niente test di massimale.">
              <NumInput value={ratio} onChange={setRatio} />
            </Field>
          </>
        )}

        {kind === 'body' && (
          <>
            <Chips options={[{ value: 'weight', label: 'Peso' }, { value: 'waist', label: 'Vita' }]} value={metric} onChange={(v) => setMetric(v as 'weight' | 'waist')} />
            <p className="text-xs text-muted">Ora: {curBody !== null ? `${fmtNum(curBody)} ${metric === 'weight' ? 'kg' : 'cm'}` : 'nessuna misura'}</p>
            <Field label={`Traguardo (${metric === 'weight' ? 'kg' : 'cm'})`} hint="Valori della bilancia = stime: guarda la media di più misure.">
              <NumInput value={bodyTarget} onChange={setBodyTarget} />
            </Field>
          </>
        )}

        {p && (
          <Card className="text-sm">
            <div className="font-semibold">{goalTitle(draft, ctx.exById)}</div>
            {p.next && <div className="text-muted mt-1">{p.next}</div>}
            {p.eta && <div className="text-xs text-muted mt-1">{p.eta}</div>}
            {p.done && <div className="text-accent mt-1">Questo traguardo l’hai già raggiunto: scegline uno un passo più in là.</div>}
          </Card>
        )}
        <Field label="🎁 Ricompensa (facoltativa)" hint="Il patto con te stesso: si sblocca al traguardo.">
          <input className={inputCls} value={reward} onChange={(e) => setReward(e.target.value)} placeholder="es. una maglia nuova da allenamento" />
        </Field>
        {warn && <p className="text-sm text-minima">{warn}</p>}
        {problem && kind === 'body' && <p className="text-sm text-muted">{problem}</p>}
        <Button big variant="primary" className="w-full" disabled={!!problem || !!p?.done} onClick={() => onAdd({ ...draft, title: goalTitle(draft, ctx.exById), reward: reward.trim() || undefined })}>Aggiungi obiettivo</Button>
      </div>
    </Sheet>
  );
}

/** Patti per i traguardi delle sedute totali (25, 50, 100…). */
function SessionRewards({ ctx }: { ctx: GoalCtx }) {
  const count = ctx.sessions.filter((x) => x.status === 'done').length;
  const next = SESSION_MILESTONES.filter((m) => m > count).slice(0, 3);
  const [vals, setVals] = useState<Record<string, string>>(ctx.settings.rewards ?? {});
  if (!next.length) return null;
  return (
    <Card>
      <div className="font-semibold">🎁 Patti con te stesso</div>
      <p className="text-xs text-muted mb-2">Una ricompensa per i prossimi traguardi delle sedute. Ne hai fatte {count}.</p>
      {next.map((m) => (
        <Field key={m} label={`${m} sedute`}>
          <input className={inputCls} value={vals[String(m)] ?? ''} placeholder="es. cena fuori" aria-label={`Ricompensa ${m} sedute`}
            onChange={(e) => setVals({ ...vals, [String(m)]: e.target.value })}
            onBlur={() => setSetting('rewards', Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim())))} />
        </Field>
      ))}
    </Card>
  );
}
