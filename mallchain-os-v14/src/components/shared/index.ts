/**
 * Shared Component Library — Central Export
 * 
 * This file exports all reusable components built on top of the design system.
 * Import from here to use components throughout the application.
 * 
 * @example
 * import { Button, Card, Badge, Heading, Container } from '@/components/shared';
 */

// Button component
export { Button } from './Button';
export type { ButtonProps } from './Button';

// Card component
export { Card } from './Card';
export type { CardProps } from './Card';

// Badge component
export { Badge } from './Badge';
export type { BadgeProps } from './Badge';

// Typography components
export {
  Heading,
  Text,
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
} from './Typography';
export type { HeadingProps, TextProps } from './Typography';

// Container component
export { Container } from './Container';
export type { ContainerProps } from './Container';

// Section component
export { Section } from './Section';
export type { SectionProps } from './Section';
