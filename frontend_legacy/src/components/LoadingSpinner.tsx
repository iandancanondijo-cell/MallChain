type LoadingSpinnerProps = {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
};

const sizeClasses: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: 'h-8 w-8 border-2',
  md: 'h-10 w-10 border-2.5',
  lg: 'h-12 w-12 border-4'
};

export default function LoadingSpinner({ size = 'md', text }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center">
      <div className={`rounded-full border-t-white border-slate-700 animate-spin ${sizeClasses[size]}`} />
      {text && <p className="text-sm text-slate-300 font-semibold">{text}</p>}
    </div>
  );
}
