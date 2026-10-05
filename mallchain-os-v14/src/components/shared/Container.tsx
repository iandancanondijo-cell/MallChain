/**
 * Container Component — Shared component library
 * 
 * Layout wrapper that manages max-width, padding, and responsive behavior.
 */

import React from 'react';
import './Container.css';

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}

/**
 * Container component for content layout
 * 
 * @example
 * <Container size="lg" padding="md">
 *   <h1>Page Title</h1>
 *   <p>Content goes here</p>
 * </Container>
 */
export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  (
    {
      size = 'lg',
      padding = 'md',
      children,
      className = '',
      ...rest
    },
    ref
  ) => {
    const classes = [
      'container',
      `container-${size}`,
      `container-p-${padding}`,
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

Container.displayName = 'Container';
