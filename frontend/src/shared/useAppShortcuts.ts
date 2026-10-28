import { useEffect } from 'react';
import type { PageKey } from './BottomNav';

interface AppShortcutsOptions {
  onNavigate: (page: PageKey) => void;
  cloudMode?: boolean;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

export function useAppShortcuts({
  onNavigate,
  cloudMode = false,
}: AppShortcutsOptions): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditable(event.target) ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      switch (event.key.toLowerCase()) {
        case 't':
          onNavigate('today');
          break;
        case 'w':
          onNavigate('week');
          break;
        case 'c':
          onNavigate('changes');
          break;
        case 's':
          if (!cloudMode) onNavigate('settings');
          break;
        case 'd':
          if (cloudMode) onNavigate('device');
          break;
        default:
          return;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [cloudMode, onNavigate]);
}
