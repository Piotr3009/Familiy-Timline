import type {ComponentPropsWithoutRef, ReactNode} from 'react';

/**
 * Small shared primitive set — keeps every screen visually consistent
 * with the design tokens in globals.css. Intentionally dependency-free.
 */

/** Conditional class-name join, shared by all components. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

export function Button({variant = 'primary', className, ...props}: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' &&
          'bg-amber text-surface-raised hover:bg-amber-strong dark:text-surface-sunken',
        variant === 'secondary' &&
          'border border-border-strong bg-surface-raised text-ink hover:bg-surface-sunken',
        variant === 'ghost' && 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
        variant === 'danger' && 'bg-danger text-surface-raised hover:opacity-90',
        className
      )}
      {...props}
    />
  );
}

export function Input({className, ...props}: ComponentPropsWithoutRef<'input'>) {
  return (
    <input
      className={cx(
        'w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber',
        className
      )}
      {...props}
    />
  );
}

export function Textarea({className, ...props}: ComponentPropsWithoutRef<'textarea'>) {
  return (
    <textarea
      className={cx(
        'w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber',
        className
      )}
      {...props}
    />
  );
}

export function Select({className, children, ...props}: ComponentPropsWithoutRef<'select'>) {
  return (
    <select
      className={cx(
        'w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-ink focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({className, ...props}: ComponentPropsWithoutRef<'label'>) {
  return (
    <label className={cx('mb-1.5 block text-sm font-medium text-ink-muted', className)} {...props} />
  );
}

export function Card({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        'rounded-card border border-border bg-surface-raised p-5 shadow-sm',
        className
      )}
    >
      {children}
    </div>
  );
}

export function Alert({
  tone,
  children
}: {
  tone: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-lg border px-4 py-3 text-sm',
        tone === 'error' && 'border-danger/30 bg-danger-soft text-danger',
        tone === 'success' && 'border-green/30 bg-green-soft text-green',
        tone === 'info' && 'border-amber/30 bg-amber-soft text-amber-strong'
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action
}: {
  icon: string;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong bg-surface-sunken/50 px-6 py-12 text-center">
      <span aria-hidden className="text-4xl">
        {icon}
      </span>
      <p className="font-heading text-lg text-ink">{title}</p>
      <p className="max-w-sm text-sm text-ink-muted">{hint}</p>
      {action}
    </div>
  );
}

const AVATAR_SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-sm',
  tree: 'h-[84px] w-[84px] text-xl',
  lg: 'h-20 w-20 text-xl'
} as const;

export function PersonAvatar({
  name,
  src,
  size = 'md',
  deceased = false
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof AVATAR_SIZES;
  deceased?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-amber-soft font-heading text-amber-strong',
        AVATAR_SIZES[size],
        deceased && 'grayscale'
      )}
    >
      {src ? (
        // Signed URLs are short-lived; a plain img avoids next/image caching issues.
        // The wrapper carries the accessible name, so the img is decorative.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}
