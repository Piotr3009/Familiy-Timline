import type {EventType} from '@/lib/database.types';

/**
 * Icon + accent color mapping for every event type.
 * Icons are emoji on purpose: zero bundle weight, universally rendered,
 * warm rather than clinical. Colors reference design tokens where
 * possible; raw values are only used inside SVG/inline styles.
 * Type NAMES are translated via i18n (events.types.<key>).
 */
export type EventTypeMeta = {
  icon: string;
  /** Tailwind text color class for the icon accent. */
  colorClass: string;
  /** Raw color for inline styles (timeline dots). */
  color: string;
};

export const EVENT_TYPES: Record<EventType, EventTypeMeta> = {
  birth: {icon: '👶', colorClass: 'text-green', color: '#2f6b4f'},
  baptism: {icon: '🕊️', colorClass: 'text-ink-muted', color: '#6f6353'},
  first_communion: {icon: '🙏', colorClass: 'text-ink-muted', color: '#6f6353'},
  school_graduation: {icon: '🎓', colorClass: 'text-amber', color: '#b45309'},
  university: {icon: '📚', colorClass: 'text-amber', color: '#b45309'},
  wedding: {icon: '💍', colorClass: 'text-amber', color: '#b45309'},
  divorce: {icon: '📄', colorClass: 'text-ink-muted', color: '#6f6353'},
  moving_home: {icon: '📦', colorClass: 'text-brown', color: '#7c5c3e'},
  home_purchase: {icon: '🏡', colorClass: 'text-brown', color: '#7c5c3e'},
  emigration: {icon: '✈️', colorClass: 'text-brown', color: '#7c5c3e'},
  job_start: {icon: '💼', colorClass: 'text-brown', color: '#7c5c3e'},
  business_start: {icon: '🚀', colorClass: 'text-amber', color: '#b45309'},
  child_birth: {icon: '🍼', colorClass: 'text-green', color: '#2f6b4f'},
  family_gathering: {icon: '🥂', colorClass: 'text-amber', color: '#b45309'},
  anniversary: {icon: '🎉', colorClass: 'text-amber', color: '#b45309'},
  death: {icon: '🕯️', colorClass: 'text-ink-muted', color: '#6f6353'},
  funeral: {icon: '🖤', colorClass: 'text-ink-muted', color: '#6f6353'},
  achievement: {icon: '🏆', colorClass: 'text-amber', color: '#b45309'},
  travel: {icon: '🧭', colorClass: 'text-green', color: '#2f6b4f'},
  other: {icon: '📌', colorClass: 'text-ink-muted', color: '#6f6353'}
};

export const EVENT_TYPE_KEYS = Object.keys(EVENT_TYPES) as EventType[];
