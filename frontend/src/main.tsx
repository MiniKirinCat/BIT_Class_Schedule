import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerOfflineShell } from './lib/offline';
import { applyTheme, getInitialTheme } from './lib/theme';
import './styles/themes.css';
import './styles.css';

applyTheme(getInitialTheme());
registerOfflineShell();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
