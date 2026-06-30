import type { ReactNode } from 'react';

export interface SvgIconProps {
  src?: string;
  children?: ReactNode;
  size?: number;
  className?: string;
  title?: string;
  [key: string]: unknown;
}

/**
 * Unified SVG icon component.
 * Accepts inline SVG content or a src URL.
 * Ensures consistent sizing, accessibility, and theming across all three frontends.
 */
export function SvgIcon({
  src,
  children,
  size = 24,
  className = '',
  title,
  ...props
}: SvgIconProps) {
  const baseClasses = `inline-flex items-center justify-center ${className}`;

  if (src) {
    return (
      <img
        src={src}
        alt={title || 'icon'}
        width={size}
        height={size}
        className={baseClasses}
        {...props}
      />
    );
  }

  if (children) {
    return (
      <span
        className={baseClasses}
        style={{ width: size, height: size }}
        role={title ? 'img' : undefined}
        aria-label={title}
        {...props}
      >
        {children}
      </span>
    );
  }

  return null;
}
