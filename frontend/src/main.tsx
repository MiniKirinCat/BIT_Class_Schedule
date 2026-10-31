import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerOfflineShell } from './lib/offline';
import { applyTheme, readStoredTheme } from './lib/theme';
import './styles/themes.css';
import './styles.css';
import './styles/app.css';
import './styles/v15.css';

applyTheme(readStoredTheme());
registerOfflineShell();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
