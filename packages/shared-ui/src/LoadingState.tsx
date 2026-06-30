import React from 'react';

export interface LoadingStateProps {
  message?: string;
  size?: 'small' | 'default' | 'large';
  fullScreen?: boolean;
  progress?: number | null;
  skeleton?: boolean;
  skeletonLines?: number;
}

/**
 * Full-area loading spinner with optional message.
 * Includes accessibility attributes for screen readers.
 * Supports skeleton mode for content placeholders.
 */
export function LoadingState({
  message = 'Loading…',
  size = 'default',
  fullScreen = false,
  progress = null,
  skeleton = false,
  skeletonLines = 3,
}: LoadingStateProps) {
  const sizeClasses = {
    small: 'w-16 h-16',
    default: 'w-48 h-48',
    large: 'w-64 h-64'
  }

  const containerClasses = fullScreen
    ? "flex flex-col items-center justify-center min-h-screen bg-slate-950"
    : "flex flex-col items-center justify-center py-12"

  if (skeleton) {
    return (
      <div
        className={fullScreen ? "min-h-screen bg-slate-950 p-6" : "py-12 px-6"}
        role="status"
        aria-live="polite"
        aria-label={message}
      >
        <div className="max-w-2xl mx-auto space-y-4">
          {Array.from({ length: skeletonLines }, (_, i) => (
            <div
              key={i}
              className="h-4 bg-slate-800 rounded-full animate-pulse"
              style={{
                width: `${Math.max(40, 100 - i * 15)}%`,
                animationDelay: `${i * 150}ms`,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={containerClasses}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className={`${sizeClasses[size]} mb-6`}>
        <img
          src="/illustrations/loading.svg"
          alt=""
          className="w-full h-full object-contain animate-spin"
          aria-hidden="true"
        />
      </div>
      <p className="text-slate-400 text-sm" aria-label={message}>
        {message}
      </p>
      {progress !== null && (
        <div
          className="mt-4 w-48 bg-slate-800 rounded-full h-2"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Loading progress"
        >
          <div
            className="bg-cyan-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}
