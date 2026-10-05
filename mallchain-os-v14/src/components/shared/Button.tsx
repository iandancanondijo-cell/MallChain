/**
 * Button Component — Shared component library
 * 
 * Reusable button that applies design tokens from design-system.css
 * Supports multiple variants, sizes, and states.
 */

import React from 'react';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

/**
 * Button component with design tokens applied
 * 
 * @example
 * <Button variant="primary" size="md">Click me</Button>
 * <Button variant="ghost" size="sm" disabled>Disabled</Button>
 * <Button loading>Loading...</Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      disabled = false,
      loading = false,
      children,
      className = '',
      icon,
      ...rest
    },
    ref
  ) => {
    const classes = [
      'btn',
      `btn-${variant}`,
      `btn-${size}`,
      loading && 'loading',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading}
        {...rest}
      >
        {loading && <span className="btn-spinner" aria-hidden="true" />}
        {icon && <span className="btn-icon">{icon}</span>}
        <span>{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
