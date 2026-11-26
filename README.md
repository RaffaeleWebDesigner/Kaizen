# Metodo Kaizen

Web app installabile (PWA) per registrare gli allenamenti nella palestra di casa e seguire la **costanza** nel tempo.
Tutto in italiano, pensata per il telefono, funziona offline. I dati restano sul dispositivo (IndexedDB), senza login e senza server.

- **Kaizen decide quanto:** +1 ripetizione o il più piccolo aumento di carico, sempre 2-3 ripetizioni di margine.
- **Presentarsi decide se:** nei giorni no c'è la seduta minima (10-15 minuti), che conta come seduta fatta.

Stack: Vite, React, TypeScript, Tailwind CSS, Dexie (IndexedDB), Recharts, vite-plugin-pwa.

## Avvio in locale

Serve Node.js 20 o più recente.

```bash
npm install
npm run dev        # sviluppo su http://localhost:5173
npm test           # test della logica (progressione, costanza, calcio)
npm run build      # build di produzione in dist/
npm run preview    # prova la build (service worker compreso) su http://localhost:4173
```

Per provarla dal telefono sulla stessa rete Wi-Fi: `npm run dev -- --host` e apri l'indirizzo mostrato.
L'installazione e l'offline funzionano solo in HTTPS (o su localhost), quindi per l'uso vero serve il deploy.

## Deploy

### GitHub Pages
1. Il repository deve essere **pubblico** (Pages su repository privati richiede un piano GitHub a pagamento).
2. Su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Ogni push su `main` avvia il workflow `.github/workflows/deploy.yml`, che esegue i test, fa la build con il percorso giusto (`/Kaizen/`) e pubblica.
4. L'app sarà su `https://<tuo-utente>.github.io/Kaizen/`.

### Netlify (va bene anche con repository privato)
1. Su Netlify: **Add new site → Import an existing project** e scegli il repository.
2. Le impostazioni sono già in `netlify.toml` (comando `npm run build`, cartella `dist`). Conferma e pubblica.
3. In alternativa, senza collegare GitHub: `npm run build` e trascina la cartella `dist` su app.netlify.com/drop.

## Installazione sul telefono

- **iPhone (Safari):** apri l'indirizzo dell'app → tasto Condividi → **Aggiungi alla schermata Home**.
- **Android (Chrome):** apri l'indirizzo → menu ⋮ → **Installa app** (o "Aggiungi a schermata Home").

Dopo la prima apertura l'app funziona anche senza connessione. Gli aggiornamenti si installano da soli alla riapertura successiva.

Su iPhone la vibrazione a fine recupero non è supportata da Safari: suona un breve bip (tieni la suoneria attiva).

## Backup dei dati

I dati vivono **solo** nel browser del telefono. Se disinstalli l'app o cancelli i dati del browser, li perdi. Quindi:

- **Altro → Dati e backup → Esporta tutto (JSON)** scarica un file con tutto: sedute, modelli, misure, partite, revisioni.
  Salvalo su Drive o iCloud, oppure mandalo a te stesso.
- **Importa backup (JSON)** sostituisce i dati attuali con quelli del file (utile per cambiare telefono).
- **Esporta allenamenti (CSV)** crea un file con una riga per serie, separato da `;`, che si apre in Excel o Fogli.
- **Copia riepilogo per il coach** copia un testo markdown con l'ultima seduta o la settimana, da incollare in chat.
- Se l'ultimo backup ha più di 14 giorni, la schermata Oggi te lo ricorda.

## Dati precaricati

Al primo avvio l'app carica: inizio progetto 16/11/2026, altezza 172 cm, le misure del 16/11, i modelli A, B, C e Minima,
la Seduta A del 16/11, le sedute saltate del 19/11 e 22/11, la malattia del 23/11, l'allenamento di calcio del mercoledì
e le partite del 20/11 e 27/11. Tutto si modifica dall'app.

## Regole dell'app

- **Costanza:** obiettivo 3 sedute a settimana. Ogni giorno di malattia toglie 1 seduta dal previsto. La striscia conta le settimane
  consecutive con almeno 2 sedute (o con il previsto ridotto raggiunto). La settimana in corso non rompe la striscia finché non finisce.
- **Progressione:** se l'ultima volta hai completato tutte le serie con RIR ≥ 2 → +1 ripetizione fino al massimo della fascia, poi
  il più piccolo aumento di carico e si torna al minimo della fascia. RIR sotto 2, serie non completate o RIR non segnato → stesso
  obiettivo. Dolore → nessuna progressione. Fermo da più di 7 giorni → circa -10% di carico.
- **Calcio:** avviso se fai gambe il giorno della partita, il giorno prima, oppure martedì o giovedì in una settimana con partita il venerdì.

## Struttura

```
src/db.ts             schema IndexedDB (Dexie)
src/seed.ts           dati iniziali
src/lib/progression.ts  logica Kaizen
src/lib/stats.ts      costanza, striscia, grafici, record
src/lib/football.ts   partite, avvisi gambe, giorni consigliati
src/lib/exportData.ts backup JSON, CSV, riepilogo coach
src/pages/            schermate
scripts/make-icons.mjs  rigenera le icone PNG da public/favicon.svg
```
