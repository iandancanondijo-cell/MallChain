/**
 * Regression coverage for StatusChip: a Campaign document created while
 * two different Mongoose schemas were racing to register under the same
 * model name (see backend/src/routes/adminPanel.js) could persist with no
 * `status` field. StatusChip called `status.charAt(0)` unconditionally,
 * which crashed the whole admin Mining tab (caught only by the top-level
 * ErrorBoundary) the moment such a campaign was rendered.
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusChip } from './ui';

describe('StatusChip', () => {
  test('renders a known status', () => {
    render(<StatusChip status="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  test('does not throw when status is undefined', () => {
    expect(() => render(<StatusChip status={undefined} />)).not.toThrow();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  test('does not throw when status is null', () => {
    expect(() => render(<StatusChip status={null} />)).not.toThrow();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
