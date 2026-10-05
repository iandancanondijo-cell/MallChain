/**
 * Typography Components — Shared component library
 * 
 * Semantic heading and text components that apply design tokens.
 */

import React from 'react';

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  children: React.ReactNode;
  className?: string;
}

export interface TextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  size?: 'xxs' | 'xs' | 'sm' | 'base' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold';
  color?: 'primary' | 'secondary' | 'tertiary' | 'gold' | 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
  className?: string;
}

/**
 * Heading component — semantic HTML with design tokens
 * 
 * @example
 * <Heading level={1}>Page Title</Heading>
 * <Heading level={2}>Section Title</Heading>
 */
export const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  (
    {
      level = 1,
      children,
      className = '',
      ...rest
    },
    ref
  ) => {
    const Tag = `h${level}` as React.ElementType;
    const classes = [
      `text-h${level}`,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <Tag ref={ref} className={classes} {...rest}>
        {children}
      </Tag>
    );
  }
);

Heading.displayName = 'Heading';

/**
 * Text component — semantic paragraph with design tokens
 * 
 * @example
 * <Text size="lg" weight="semibold">Large, bold text</Text>
 * <Text color="secondary">Secondary text color</Text>
 */
export const Text = React.forwardRef<HTMLParagraphElement, TextProps>(
  (
    {
      size = 'base',
      weight = 'normal',
      color = 'primary',
      children,
      className = '',
      ...rest
    },
    ref
  ) => {
    const classes = [
      `text-${size}`,
      `font-${weight}`,
      `text-${color}`,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <p ref={ref} className={classes} {...rest}>
        {children}
      </p>
    );
  }
);

Text.displayName = 'Text';

/**
 * Semantic heading aliases
 */
export const H1 = (props: Omit<HeadingProps, 'level'>) => <Heading level={1} {...props} />;
export const H2 = (props: Omit<HeadingProps, 'level'>) => <Heading level={2} {...props} />;
export const H3 = (props: Omit<HeadingProps, 'level'>) => <Heading level={3} {...props} />;
export const H4 = (props: Omit<HeadingProps, 'level'>) => <Heading level={4} {...props} />;
export const H5 = (props: Omit<HeadingProps, 'level'>) => <Heading level={5} {...props} />;
export const H6 = (props: Omit<HeadingProps, 'level'>) => <Heading level={6} {...props} />;
