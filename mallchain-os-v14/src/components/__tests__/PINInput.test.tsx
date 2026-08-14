import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PINInput from '../PINInput';

describe('PINInput', () => {
  test('strips non-digit characters before calling onChange', () => {
    const onChange = vi.fn();
    render(<PINInput value="" onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText('••••'), { target: { value: 'a1b2c3' } });

    expect(onChange).toHaveBeenCalledWith('123');
  });

  test('truncates input to maxLength digits', () => {
    const onChange = vi.fn();
    render(<PINInput value="" onChange={onChange} maxLength={4} />);

    fireEvent.change(screen.getByPlaceholderText('••••'), { target: { value: '123456789' } });

    expect(onChange).toHaveBeenCalledWith('1234');
  });

  test('blocks paste events entirely', () => {
    const onChange = vi.fn();
    render(<PINInput value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('••••');

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    input.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('renders the current length against maxLength', () => {
    render(<PINInput value="12" onChange={vi.fn()} maxLength={6} />);

    expect(screen.getByText('2 / 6')).toBeInTheDocument();
  });

  test('applies the error class when error is true', () => {
    render(<PINInput value="" onChange={vi.fn()} error />);

    expect(screen.getByPlaceholderText('••••')).toHaveClass('err');
  });
});
