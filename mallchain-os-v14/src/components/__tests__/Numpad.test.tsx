import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Numpad from '../Numpad';

describe('Numpad', () => {
  test('clicking a digit appends it via onChange', () => {
    const onChange = vi.fn();
    render(<Numpad value="12" onChange={onChange} onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('3'));

    expect(onChange).toHaveBeenCalledWith('123');
  });

  test('digit buttons are disabled once maxLength is reached', () => {
    render(<Numpad value="123456" onChange={vi.fn()} onSubmit={vi.fn()} maxLength={6} />);

    expect(screen.getByLabelText('1')).toBeDisabled();
    expect(screen.getByLabelText('9')).toBeDisabled();
  });

  test('backspace removes the last digit', () => {
    const onChange = vi.fn();
    render(<Numpad value="123" onChange={onChange} onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Backspace'));

    expect(onChange).toHaveBeenCalledWith('12');
  });

  test('the confirm button is only enabled once the PIN reaches maxLength', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<Numpad value="123" onChange={vi.fn()} onSubmit={onSubmit} maxLength={6} />);
    expect(screen.getByLabelText('Confirm PIN')).toBeDisabled();

    rerender(<Numpad value="123456" onChange={vi.fn()} onSubmit={onSubmit} maxLength={6} />);
    expect(screen.getByLabelText('Confirm PIN')).toBeEnabled();

    fireEvent.click(screen.getByLabelText('Confirm PIN'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('everything is disabled when the disabled prop is set', () => {
    render(<Numpad value="12" onChange={vi.fn()} onSubmit={vi.fn()} disabled />);

    expect(screen.getByLabelText('1')).toBeDisabled();
    expect(screen.getByLabelText('Backspace')).toBeDisabled();
  });

  test('keyboard digit presses append via onChange, respecting maxLength', () => {
    const onChange = vi.fn();
    render(<Numpad value="12345" onChange={onChange} onSubmit={vi.fn()} maxLength={6} />);

    fireEvent.keyDown(window, { key: '6' });
    expect(onChange).toHaveBeenCalledWith('123456');
  });

  test('keyboard Enter triggers onSubmit', () => {
    const onSubmit = vi.fn();
    render(<Numpad value="123456" onChange={vi.fn()} onSubmit={onSubmit} maxLength={6} />);

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('keyboard input is ignored while disabled', () => {
    const onChange = vi.fn();
    render(<Numpad value="12" onChange={onChange} onSubmit={vi.fn()} disabled />);

    fireEvent.keyDown(window, { key: '3' });

    expect(onChange).not.toHaveBeenCalled();
  });
});
