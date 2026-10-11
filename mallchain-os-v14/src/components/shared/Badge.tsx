import React from 'react';
import './Badge.css';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: 'gold' | 'success' | 'error' | 'warning' | 'info';
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      color = 'gold',
      dot = false,
      children,
      className = '',
      ...rest
    },
    ref
  ) => {
    const classes = [
      'badge',
      `badge-${color}`,
      dot && 'badge-dot',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <span ref={ref} className={classes} {...rest}>
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
