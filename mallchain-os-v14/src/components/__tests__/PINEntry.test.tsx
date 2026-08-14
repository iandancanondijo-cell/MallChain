import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PINEntry, PINNumpad } from '../PINEntry';

describe('PINEntry', () => {
  test('typing digits on the hidden input calls onChange with the accumulated value', () => {
    const onChange = vi.fn();
    render(<PINEntry value="1" onChange={onChange} length={4} />);

    fireEvent.keyDown(screen.getByLabelText('PIN input'), { key: '2' });

    expect(onChange).toHaveBeenCalledWith('12');
  });

  test('backspace removes the last digit', () => {
    const onChange = vi.fn();
    render(<PINEntry value="123" onChange={onChange} length={4} />);

    fireEvent.keyDown(screen.getByLabelText('PIN input'), { key: 'Backspace' });

    expect(onChange).toHaveBeenCalledWith('12');
  });

  test('does not grow the value past the configured length', () => {
    const onChange = vi.fn();
    render(<PINEntry value="1234" onChange={onChange} length={4} />);

    fireEvent.keyDown(screen.getByLabelText('PIN input'), { key: '5' });

    expect(onChange).not.toHaveBeenCalled();
  });

  test('calls onComplete shortly after the final digit is entered', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(<PINEntry value="123" onChange={onChange} onComplete={onComplete} length={4} />);

    fireEvent.keyDown(screen.getByLabelText('PIN input'), { key: '4' });
    expect(onChange).toHaveBeenCalledWith('1234');

    vi.advanceTimersByTime(150);
    expect(onComplete).toHaveBeenCalledWith('1234');
    vi.useRealTimers();
  });

  test('blocks paste on the hidden input', () => {
    const onChange = vi.fn();
    render(<PINEntry value="" onChange={onChange} length={4} />);
    const input = screen.getByLabelText('PIN input');

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    input.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  test('locks input and shows a warning once max attempts are reached', () => {
    render(<PINEntry value="" onChange={vi.fn()} attempts={3} maxAttempts={3} />);

    expect(screen.getByLabelText('PIN input')).toBeDisabled();
    expect(screen.getByText(/Too many failed attempts/)).toBeInTheDocument();
  });

  test('ignores keyboard input once locked out', () => {
    const onChange = vi.fn();
    render(<PINEntry value="12" onChange={onChange} attempts={3} maxAttempts={3} />);

    fireEvent.keyDown(screen.getByLabelText('PIN input'), { key: '3' });

    expect(onChange).not.toHaveBeenCalled();
  });

  test('shows remaining attempts', () => {
    render(<PINEntry value="" onChange={vi.fn()} attempts={1} maxAttempts={3} />);

    expect(screen.getByText('Attempts remaining: 2/3')).toBeInTheDocument();
  });

  test('auto-clears the value after the timeout elapses', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<PINEntry value="12" onChange={onChange} autoTimeoutMs={1000} />);

    vi.advanceTimersByTime(1000);

    expect(onChange).toHaveBeenCalledWith('');
    vi.useRealTimers();
  });
});

describe('PINNumpad', () => {
  test('clicking a digit appends it and auto-completes at maxLength', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(<PINNumpad value="123" onChange={onChange} maxLength={4} onComplete={onComplete} />);

    fireEvent.click(screen.getByLabelText('Enter 4'));
    expect(onChange).toHaveBeenCalledWith('1234');

    vi.advanceTimersByTime(150);
    expect(onComplete).toHaveBeenCalledWith('1234');
    vi.useRealTimers();
  });

  test('digit buttons disable once the PIN is full', () => {
    render(<PINNumpad value="1234" onChange={vi.fn()} maxLength={4} />);

    expect(screen.getByLabelText('Enter 1')).toBeDisabled();
  });

  test('the confirm button only appears once the PIN reaches maxLength', () => {
    const { rerender } = render(<PINNumpad value="123" onChange={vi.fn()} maxLength={4} onComplete={vi.fn()} />);
    expect(screen.queryByText('Confirm PIN')).not.toBeInTheDocument();

    rerender(<PINNumpad value="1234" onChange={vi.fn()} maxLength={4} onComplete={vi.fn()} />);
    expect(screen.getByText('Confirm PIN')).toBeInTheDocument();
  });
});
