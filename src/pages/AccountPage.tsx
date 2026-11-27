import { useState } from 'react';
import { Button, Card, Confirm, Header, toast } from '../components/ui';
import { downloadBackup } from '../lib/exportData';
import { fmtDate } from '../lib/dates';
import { link, restoreInternalBackup, signIn, signOut, signUp, syncNow, useSync } from '../sync';

const input = 'w-full min-h-[48px] bg-surface2 border border-line rounded-xl px-3 text-base';

function ago(ts: number | null) {
  if (!ts) return 'mai';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} min fa`;
  return new Date(ts).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function LoginForm() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'in') await signIn(email, pw);
      else if (await signUp(email, pw)) setSent(true);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Card>
        <h2 className="font-bold mb-1">Controlla la posta</h2>
        <p className="text-sm text-muted">Ti è arrivata un’email da Supabase: apri il link per confermare l’account. Si aprirà nel browser: va bene così. Poi torna qui e accedi con email e password.</p>
        <Button className="w-full mt-3" onClick={() => { setSent(false); setMode('in'); }}>Ho confermato, accedo</Button>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="font-bold mb-1">{mode === 'in' ? 'Accedi' : 'Crea un account'}</h2>
      <p className="text-sm text-muted mb-3">Con lo stesso account su iPhone e PC vedi gli stessi progressi. Ogni account ha i suoi dati.</p>
      <form onSubmit={submit} className="space-y-2">
        <input className={input} type="email" autoComplete="email" inputMode="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={input} type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="Password (almeno 6 caratteri)" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
        {err && <p className="text-sm text-danger">{err}</p>}
        <Button big variant="primary" className="w-full" disabled={busy}>{busy ? 'Un attimo…' : mode === 'in' ? 'Accedi' : 'Crea account'}</Button>
      </form>
      <button className="text-sm text-accent mt-3" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(null); }}>
        {mode === 'in' ? 'Non hai un account? Creane uno' : 'Hai già un account? Accedi'}
      </button>
    </Card>
  );
}

export default function AccountPage() {
  const s = useSync();
  const [confirmOut, setConfirmOut] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [choice, setChoice] = useState<'cloud' | 'device' | null>(null);

  const linkWithBackup = async () => {
    try {
      await downloadBackup();
    } catch {
      /* se il download non parte, resta comunque la copia interna */
    }
    await link();
  };

  return (
    <div className="pb-nav">
      <Header title="Account e sincronizzazione" back="/altro" />
      <div className="p-4 space-y-3">
        {s.phase === 'loading' && <Card><p className="text-muted">Caricamento…</p></Card>}

        {s.phase === 'signedOut' && <LoginForm />}

        {s.phase === 'notLinked' && (
          <Card>
            <h2 className="font-bold mb-1">Collega questo dispositivo</h2>
            <p className="text-sm text-muted mb-1">Account: <b className="text-ink">{s.email}</b></p>
            <ul className="text-sm text-muted list-disc pl-5 my-2 space-y-1">
              <li>Se il cloud è vuoto, i dati di questo dispositivo vengono caricati. Non si cancella niente.</li>
              <li>Se questo dispositivo ha solo i dati iniziali dell’app, prende quelli del cloud.</li>
              <li>Se ci sono dati veri da entrambe le parti, ti chiedo quali tenere.</li>
              <li>Le foto restano solo su questo dispositivo.</li>
            </ul>
            <p className="text-sm text-muted mb-3">Prima scarica un backup: è la tua rete di sicurezza. L’app ne tiene anche una copia interna.</p>
            <div className="grid gap-2">
              <Button big variant="primary" onClick={linkWithBackup}>Scarica il backup e collega</Button>
              <Button variant="ghost" onClick={() => link()}>Collega senza scaricare il backup</Button>
            </div>
          </Card>
        )}

        {s.phase === 'ask' && s.ask && (
          <Card className="border-minima/50">
            <h2 className="font-bold mb-1">Quali dati tengo?</h2>
            <p className="text-sm text-muted mb-3">
              {s.ask.reason === 'otherAccount'
                ? 'Su questo dispositivo ci sono i dati di un altro account.'
                : 'Ci sono dati veri sia su questo dispositivo sia nel cloud.'}{' '}
              Unirli creerebbe doppioni, quindi ne tengo una versione sola.
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div className="bg-surface2 rounded-xl p-3">
                <div className="font-semibold">Questo dispositivo</div>
                <div className="text-muted">{s.ask.local.sessions} sedute, {s.ask.local.measurements} misure</div>
                <div className="text-muted">Ultima: {s.ask.local.lastSession ? fmtDate(s.ask.local.lastSession) : '–'}</div>
              </div>
              <div className="bg-surface2 rounded-xl p-3">
                <div className="font-semibold">Cloud</div>
                <div className="text-muted">{s.ask.cloud.sessions} sedute, {s.ask.cloud.measurements} misure</div>
                <div className="text-muted">Ultima: {s.ask.cloud.lastSession ? fmtDate(s.ask.cloud.lastSession) : '–'}</div>
              </div>
            </div>
            <div className="grid gap-2">
              <Button big onClick={() => setChoice('cloud')}>Usa i dati del cloud</Button>
              <Button big onClick={() => setChoice('device')}>Usa i dati di questo dispositivo</Button>
            </div>
          </Card>
        )}

        {(s.phase === 'ok' || s.phase === 'syncing' || s.phase === 'error') && (
          <Card className={s.phase === 'error' ? 'border-danger/50' : ''}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2.5 h-2.5 rounded-full ${s.phase === 'error' ? 'bg-danger' : s.phase === 'syncing' ? 'bg-minima animate-pulse' : 'bg-accent'}`} />
              <h2 className="font-bold">{s.phase === 'error' ? 'Sincronizzazione non riuscita' : s.phase === 'syncing' ? 'Sincronizzo…' : 'Sincronizzato'}</h2>
            </div>
            <p className="text-sm text-muted">Account: <b className="text-ink">{s.email}</b></p>
            <p className="text-sm text-muted">Ultima sincronizzazione: <b className="text-ink">{ago(s.lastSyncAt)}</b></p>
            {s.pending > 0 && <p className="text-sm text-muted">Modifiche da inviare: <b className="text-ink">{s.pending}</b></p>}
            {s.error && <p className="text-sm text-danger mt-2">{s.error}</p>}
            {s.phase === 'error' && s.error?.includes('pausa') && (
              <p className="text-xs text-muted mt-1">Se il progetto è in pausa, riattivalo da supabase.com (Restore project). Intanto l’app funziona e invia tutto appena torna disponibile.</p>
            )}
            <Button big variant="primary" className="w-full mt-3" disabled={s.phase === 'syncing'} onClick={() => syncNow()}>Sincronizza ora</Button>
            <p className="text-xs text-muted mt-3">Si sincronizza da sola quando apri l’app, quando salvi qualcosa e quando torna la rete. Le foto restano solo su questo dispositivo.</p>
          </Card>
        )}

        {s.email && (
          <Card>
            <Button className="w-full" onClick={() => setConfirmOut(true)}>Esci dall’account</Button>
            <p className="text-xs text-muted mt-2">I dati restano su questo dispositivo.</p>
          </Card>
        )}

        {s.backupAt && (
          <Card>
            <h2 className="font-bold mb-1">Copia di sicurezza</h2>
            <p className="text-sm text-muted mb-3">Fatta prima del collegamento, il {new Date(s.backupAt).toLocaleString('it-IT')}. Foto escluse.</p>
            <Button className="w-full" onClick={() => setConfirmRestore(true)}>Ripristina questa copia</Button>
          </Card>
        )}
      </div>

      <Confirm open={confirmOut} onClose={() => setConfirmOut(false)} title="Uscire dall’account?" confirmLabel="Esci"
        text="La sincronizzazione si ferma. I dati restano su questo dispositivo e nel cloud." onConfirm={() => signOut()} />
      <Confirm open={confirmRestore} onClose={() => setConfirmRestore(false)} danger title="Ripristinare la copia?" confirmLabel="Ripristina"
        text="I dati di questo dispositivo tornano com’erano prima del collegamento. Se sei collegato, la copia viene inviata anche al cloud."
        onConfirm={async () => { try { await restoreInternalBackup(); toast('Copia ripristinata'); } catch (e) { toast((e as Error).message); } }} />
      <Confirm open={!!choice} onClose={() => setChoice(null)} danger
        title={choice === 'cloud' ? 'Usare i dati del cloud?' : 'Usare i dati di questo dispositivo?'}
        confirmLabel="Scarica il backup e continua"
        text={choice === 'cloud'
          ? 'I dati di questo dispositivo vengono sostituiti da quelli del cloud (le foto restano). Prima scarico un backup.'
          : 'I dati nel cloud vengono sostituiti da quelli di questo dispositivo, anche sugli altri dispositivi collegati. Prima scarico un backup.'}
        onConfirm={async () => {
          const c = choice!;
          try { await downloadBackup(); } catch { /* resta la copia interna */ }
          await link(c);
        }} />
    </div>
  );
}
