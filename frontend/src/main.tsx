import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerOfflineShell } from './lib/offline';
import './styles/themes.css';
import './styles.css';
import './styles/app.css';

registerOfflineShell();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
