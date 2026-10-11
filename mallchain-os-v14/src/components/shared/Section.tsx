import React from 'react';
import './Section.css';
import { Heading, Text } from './Typography';

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const Section = React.forwardRef<HTMLElement, SectionProps>(
  (
    {
      title,
      description,
      children,
      className = '',
      ...rest
    },
    ref
  ) => {
    const classes = [
      'section',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <section ref={ref} className={classes} {...rest}>
        {title && (
          <div className="section-header">
            <Heading level={2} className="section-title">
              {title}
            </Heading>
            {description && (
              <Text size="md" color="secondary" className="section-description">
                {description}
              </Text>
            )}
          </div>
        )}
        <div className="section-content">
          {children}
        </div>
      </section>
    );
  }
);

Section.displayName = 'Section';
