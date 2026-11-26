import { Link } from 'react-router-dom';
import { Card, Header } from '../components/ui';

const ITEMS = [
  { to: '/modelli', icon: '📋', title: 'Modelli di seduta', text: 'A, B, C e Minima: esercizi, serie, fasce e carichi' },
  { to: '/calcio', icon: '⚽', title: 'Calcio e pianificazione', text: 'Partite, allenamenti e i 3 giorni migliori per la palestra' },
  { to: '/revisioni', icon: '🪞', title: 'Revisioni', text: 'Revisione settimanale e punto del mese' },
  { to: '/dati', icon: '💾', title: 'Dati e backup', text: 'Riepilogo per il coach, JSON, CSV' },
  { to: '/impostazioni', icon: '⚙️', title: 'Impostazioni', text: 'Inizio progetto, altezza, obiettivo, lat machine' },
];

export default function MorePage() {
  return (
    <div className="pb-nav">
      <Header title="Altro" />
      <div className="p-4 space-y-2">
        {ITEMS.map((i) => (
          <Link key={i.to} to={i.to} className="block">
            <Card className="flex items-center gap-3 p-4">
              <span className="text-2xl" aria-hidden>{i.icon}</span>
              <div className="flex-1">
                <div className="font-semibold">{i.title}</div>
                <div className="text-sm text-muted">{i.text}</div>
              </div>
              <span className="text-muted">›</span>
            </Card>
          </Link>
        ))}
        <Card className="mt-4">
          <p className="font-semibold mb-1">Le due regole</p>
          <p className="text-sm text-muted"><b className="text-ink">Kaizen decide quanto:</b> +1 ripetizione o il carico più piccolo possibile, sempre 2-3 ripetizioni di margine, 30-45 minuti.</p>
          <p className="text-sm text-muted mt-1"><b className="text-ink">Presentarsi decide se:</b> si va sempre. Nei giorni no c’è la seduta minima, e conta.</p>
        </Card>
      </div>
    </div>
  );
}
