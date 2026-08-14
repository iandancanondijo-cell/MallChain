import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PasswordStrength from '../PasswordStrength';

describe('PasswordStrength', () => {
  test('shows Weak and no requirements met for an empty password', () => {
    render(<PasswordStrength password="" />);

    expect(screen.getByText('Weak')).toBeInTheDocument();
    expect(screen.getByText('At least 8 characters').closest('.strength-requirement')).not.toHaveClass('met');
  });

  test('scores length, uppercase, number, and special char independently', () => {
    const { rerender } = render(<PasswordStrength password="alllowercase" />);
    // length only -> 1 point
    expect(screen.getByText('Fair')).toBeInTheDocument();

    rerender(<PasswordStrength password="Alllowercase" />);
    // length + uppercase -> 2 points
    expect(screen.getByText('Good')).toBeInTheDocument();

    rerender(<PasswordStrength password="Alllowercase1" />);
    // length + uppercase + number -> 3 points, capped at "Strong"
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });

  test('caps the score at 3 even when all four criteria are met', () => {
    render(<PasswordStrength password="Str0ng!Pass" />);

    expect(screen.getByText('Strong')).toBeInTheDocument();
    expect(screen.getByText('At least 8 characters').closest('.strength-requirement')).toHaveClass('met');
    expect(screen.getByText('Contains uppercase (A-Z)').closest('.strength-requirement')).toHaveClass('met');
    expect(screen.getByText('Contains number (0-9)').closest('.strength-requirement')).toHaveClass('met');
    expect(
      screen.getByText('Contains special character (!@#$...)').closest('.strength-requirement')
    ).toHaveClass('met');
  });

  test('a short password with every character class still fails the length requirement', () => {
    render(<PasswordStrength password="A1!" />);

    expect(screen.getByText('At least 8 characters').closest('.strength-requirement')).not.toHaveClass('met');
    expect(screen.getByText('Contains uppercase (A-Z)').closest('.strength-requirement')).toHaveClass('met');
  });
});
