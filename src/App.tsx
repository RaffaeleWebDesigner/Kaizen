import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { ToastHost } from './components/ui';
import Today from './pages/Today';
import SessionPage from './pages/SessionPage';
import SessionDone from './pages/SessionDone';
import SkipPage from './pages/SkipPage';
import CalendarPage from './pages/CalendarPage';
import ProgressPage from './pages/ProgressPage';
import BodyPage from './pages/BodyPage';
import MorePage from './pages/MorePage';
import TemplatesPage from './pages/TemplatesPage';
import TemplateEdit from './pages/TemplateEdit';
import ExerciseEdit from './pages/ExerciseEdit';
import FootballPage from './pages/FootballPage';
import ReviewsPage from './pages/ReviewsPage';
import MonthlyReview from './pages/MonthlyReview';
import DataPage from './pages/DataPage';
import SettingsPage from './pages/SettingsPage';

const TABS = [
  { to: '/', label: 'Oggi', icon: '●' },
  { to: '/calendario', label: 'Calendario', icon: '▦' },
  { to: '/progressi', label: 'Progressi', icon: '↗' },
  { to: '/corpo', label: 'Corpo', icon: '◎' },
  { to: '/altro', label: 'Altro', icon: '≡' },
];

function BottomNav() {
  const loc = useLocation();
  if (loc.pathname.startsWith('/seduta/')) return null;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-bg/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-lg mx-auto grid grid-cols-5">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => `flex flex-col items-center justify-center h-16 text-[11px] gap-0.5 ${isActive ? 'text-accent' : 'text-muted'}`}
          >
            <span className="text-xl leading-none" aria-hidden>{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="max-w-lg mx-auto min-h-screen">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/seduta/:id" element={<SessionPage />} />
          <Route path="/fatta/:id" element={<SessionDone />} />
          <Route path="/salta" element={<SkipPage />} />
          <Route path="/calendario" element={<CalendarPage />} />
          <Route path="/progressi" element={<ProgressPage />} />
          <Route path="/corpo" element={<BodyPage />} />
          <Route path="/altro" element={<MorePage />} />
          <Route path="/modelli" element={<TemplatesPage />} />
          <Route path="/modelli/:code" element={<TemplateEdit />} />
          <Route path="/esercizi/:id" element={<ExerciseEdit />} />
          <Route path="/calcio" element={<FootballPage />} />
          <Route path="/revisioni" element={<ReviewsPage />} />
          <Route path="/revisioni/mese/:n" element={<MonthlyReview />} />
          <Route path="/dati" element={<DataPage />} />
          <Route path="/impostazioni" element={<SettingsPage />} />
        </Routes>
      </div>
      <BottomNav />
      <ToastHost />
    </HashRouter>
  );
}
