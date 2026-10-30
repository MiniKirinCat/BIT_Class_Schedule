import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { PageKey } from '../../types';
import { useAppShortcuts } from '../useAppShortcuts';

function ShortcutHost() {
  const [page, setPage] = useState<PageKey>('today');
  useAppShortcuts({ onNavigate: setPage });
  return (
    <div>
      <span>{page}</span>
      <input aria-label="搜索" />
    </div>
  );
}

describe('app shortcuts', () => {
  it('navigates with single-letter shortcuts', async () => {
    render(<ShortcutHost />);
    await userEvent.keyboard('w');
    expect(screen.getByText('schedule')).toBeInTheDocument();
    await userEvent.keyboard('c');
    expect(screen.getByText('changes')).toBeInTheDocument();
    await userEvent.keyboard('t');
    expect(screen.getByText('today')).toBeInTheDocument();
  });

  it('ignores shortcuts while typing in a field', async () => {
    render(<ShortcutHost />);
    const input = screen.getByLabelText('搜索');
    await userEvent.click(input);
    await userEvent.keyboard('w');
    expect(screen.getByText('today')).toBeInTheDocument();
  });
});
