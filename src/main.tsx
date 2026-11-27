import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';
import { seedIfEmpty } from './seed';
import { ensureV2, ensureV3 } from './migrations';
import { syncDerived } from './lib/derived';

registerSW({ immediate: true });

seedIfEmpty()
  .then(() => ensureV2())
  .then(() => ensureV3())
  .then(() => syncDerived())
  .catch((e) => console.error('Seed fallito', e))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
