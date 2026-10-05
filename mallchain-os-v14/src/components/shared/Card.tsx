/**
 * Card Component — Shared component library
 * 
 * Reusable card container with design tokens and variants.
 */

import React from 'react';
import './Card.css';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'hover' | 'interactive' | 'featured' | 'compact' | 'dense';
  children: React.ReactNode;
  className?: string;
}

/**
 * Card component with design tokens applied
 * 
 * @example
 * <Card variant="hover">
 *   <h3>Card Title</h3>
 *   <p>Card content goes here</p>
 * </Card>
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      children,
      className = '',
      ...rest
    },
    ref
  ) => {
    const classes = [
      'card',
      variant !== 'default' && `card-${variant}`,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div ref={ref} className={classes} {...rest}>
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
