/**
 * Skeleton Loading Components
 * Provides shimmer animations for better perceived performance
 * 
 * Usage:
 * <SkeletonText lines={3} />
 * <SkeletonCard count={5} />
 * <SkeletonTable rows={10} cols={5} />
 */

import { CSSProperties } from 'react';
import './Skeleton.css';

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  animate?: boolean;
}

/**
 * Skeleton line (text placeholder)
 */
export function SkeletonText({ 
  lines = 1, 
  className = '', 
  style,
  animate = true 
}: SkeletonProps & { lines?: number }) {
  return (
    <div className={`skeleton-text ${animate ? 'skeleton--animate' : ''} ${className}`} style={style}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-text__line" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}

/**
 * Skeleton card (product, listing, etc.)
 */
export function SkeletonCard({ 
  count = 1, 
  className = '',
  animate = true 
}: SkeletonProps & { count?: number }) {
  return (
    <div className={`skeleton-cards ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`skeleton-card ${animate ? 'skeleton--animate' : ''}`}>
          <div className="skeleton-card__image" />
          <div className="skeleton-card__content">
            <div className="skeleton-card__title" />
            <div className="skeleton-card__subtitle" />
            <div className="skeleton-card__price" />
            <div className="skeleton-card__button" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton table (listings, transactions, etc.)
 */
export function SkeletonTable({ 
  rows = 5, 
  cols = 5,
  className = '',
  animate = true 
}: SkeletonProps & { rows?: number; cols?: number }) {
  return (
    <div className={`skeleton-table ${animate ? 'skeleton--animate' : ''} ${className}`}>
      {/* Header */}
      <div className="skeleton-table__header">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={`header-${i}`} className="skeleton-table__cell skeleton-table__cell--header" />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={`row-${rowIdx}`} className="skeleton-table__row">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <div key={`cell-${rowIdx}-${colIdx}`} className="skeleton-table__cell" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton avatar (user profile picture)
 */
export function SkeletonAvatar({ 
  size = 'md',
  className = '',
  animate = true 
}: SkeletonProps & { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div 
      className={`skeleton-avatar skeleton-avatar--${size} ${animate ? 'skeleton--animate' : ''} ${className}`}
    />
  );
}

/**
 * Skeleton button
 */
export function SkeletonButton({ 
  width = '100%',
  className = '',
  animate = true 
}: SkeletonProps & { width?: string }) {
  return (
    <div 
      className={`skeleton-button ${animate ? 'skeleton--animate' : ''} ${className}`}
      style={{ width }}
    />
  );
}

/**
 * Skeleton input field
 */
export function SkeletonInput({ 
  className = '',
  animate = true 
}: SkeletonProps) {
  return (
    <div 
      className={`skeleton-input ${animate ? 'skeleton--animate' : ''} ${className}`}
    />
  );
}

/**
 * Skeleton list (stacked items)
 */
export function SkeletonList({ 
  items = 3,
  className = '',
  animate = true 
}: SkeletonProps & { items?: number }) {
  return (
    <div className={`skeleton-list ${className}`}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className={`skeleton-list__item ${animate ? 'skeleton--animate' : ''}`}>
          <div className="skeleton-list__icon" />
          <div className="skeleton-list__content">
            <div className="skeleton-list__title" />
            <div className="skeleton-list__subtitle" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton panel (dashboard card)
 */
export function SkeletonPanel({ 
  className = '',
  animate = true 
}: SkeletonProps) {
  return (
    <div className={`skeleton-panel ${animate ? 'skeleton--animate' : ''} ${className}`}>
      <div className="skeleton-panel__header" />
      <div className="skeleton-panel__content">
        <div className="skeleton-panel__line" style={{ width: '80%' }} />
        <div className="skeleton-panel__line" style={{ width: '60%' }} />
        <div className="skeleton-panel__line" style={{ width: '90%' }} />
      </div>
      <div className="skeleton-panel__footer" />
    </div>
  );
}

/**
 * Skeleton page layout (full page loading state)
 */
export function SkeletonPageLayout({ 
  className = '',
  animate = true 
}: SkeletonProps) {
  return (
    <div className={`skeleton-page ${className}`}>
      {/* Header */}
      <div className={`skeleton-page__header ${animate ? 'skeleton--animate' : ''}`}>
        <div className="skeleton-page__title" />
        <div className="skeleton-page__subtitle" style={{ width: '50%' }} />
      </div>
      
      {/* Content grid */}
      <div className="skeleton-page__grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`skeleton-panel ${animate ? 'skeleton--animate' : ''}`}>
            <div className="skeleton-panel__header" />
            <div className="skeleton-panel__content">
              <div className="skeleton-panel__line" />
              <div className="skeleton-panel__line" style={{ width: '70%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Suspense wrapper for components with loading state
 */
export function SkeletonFallback({ 
  type = 'panel',
  count = 1
}: { 
  type?: 'card' | 'table' | 'panel' | 'list' | 'page';
  count?: number;
}) {
  switch (type) {
    case 'card':
      return <SkeletonCard count={count} />;
    case 'table':
      return <SkeletonTable rows={count} />;
    case 'list':
      return <SkeletonList items={count} />;
    case 'page':
      return <SkeletonPageLayout />;
    case 'panel':
    default:
      return <SkeletonPanel />;
  }
}
