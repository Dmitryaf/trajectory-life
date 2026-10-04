/** Versioned, content-free wire contract shared with the ingestion function. */
export const TELEMETRY_POLICY_VERSION = 1;
export const TELEMETRY_QUEUE_LIMIT = 100;
export const TELEMETRY_BATCH_LIMIT = 20;
export const TELEMETRY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const TELEMETRY_BODY_LIMIT = 16_384;

type EmptyProps = Record<string, never>;
type SaveProps = { save_kind: 'created' | 'updated' };
export interface ProductEventProps {
  app_opened: EmptyProps;
  first_use_started: EmptyProps;
  first_use_completed: EmptyProps;
  first_use_overview_viewed: EmptyProps;
  daily_entry_saved: SaveProps & { recorded_field_count: number; entry_count_bucket: '1' | '2' | '3+' };
  week_opened: EmptyProps;
  week_review_saved: SaveProps;
  month_opened: EmptyProps;
  month_review_saved: SaveProps;
  history_opened: EmptyProps;
  journal_opened: EmptyProps;
  decision_saved: { period_type: 'week' | 'month' };
  experiment_started: EmptyProps;
}
export type ProductEventName = keyof ProductEventProps;
export type ProductEvent = {
  [Name in ProductEventName]: {
    event_id: string;
    event_name: Name;
    schema_version: 1;
    occurred_at: string;
    app_version: string;
    platform: 'web' | 'ios' | 'android';
    props: ProductEventProps[Name];
  };
}[ProductEventName];

const properties: Record<ProductEventName, readonly string[]> = {
  app_opened: [],
  first_use_started: [],
  first_use_completed: [],
  first_use_overview_viewed: [],
  daily_entry_saved: ['save_kind', 'recorded_field_count', 'entry_count_bucket'],
  week_opened: [],
  week_review_saved: ['save_kind'],
  month_opened: [],
  month_review_saved: ['save_kind'],
  history_opened: [],
  journal_opened: [],
  decision_saved: ['period_type'],
  experiment_started: [],
};
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validProps(name: ProductEventName, props: Record<string, unknown>): boolean {
  if (!hasExactKeys(props, properties[name])) {
    return false;
  }
  if ('save_kind' in props && (typeof props.save_kind !== 'string' || !['created', 'updated'].includes(props.save_kind))) {
    return false;
  }
  if ('period_type' in props && (typeof props.period_type !== 'string' || !['week', 'month'].includes(props.period_type))) {
    return false;
  }
  if (name !== 'daily_entry_saved') {
    return true;
  }
  return (
    Number.isInteger(props.recorded_field_count) &&
    Number(props.recorded_field_count) >= 1 &&
    Number(props.recorded_field_count) <= 64 &&
    typeof props.entry_count_bucket === 'string' &&
    ['1', '2', '3+'].includes(props.entry_count_bucket)
  );
}
export function isProductEvent(value: unknown, now = Date.now()): value is ProductEvent {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ['event_id', 'event_name', 'schema_version', 'occurred_at', 'app_version', 'platform', 'props'])
  ) {
    return false;
  }
  if (
    !isUuid(value.event_id) ||
    value.schema_version !== 1 ||
    typeof value.event_name !== 'string' ||
    !Object.hasOwn(properties, value.event_name)
  ) {
    return false;
  }
  if (typeof value.occurred_at !== 'string') {
    return false;
  }
  const time = Date.parse(value.occurred_at);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString() !== value.occurred_at ||
    time < now - TELEMETRY_MAX_AGE_MS ||
    time > now + 300_000
  ) {
    return false;
  }
  if (typeof value.app_version !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[a-z0-9]{1,12})?$/.test(value.app_version)) {
    return false;
  }
  return (
    typeof value.platform === 'string' &&
    ['web', 'ios', 'android'].includes(value.platform) &&
    isObject(value.props) &&
    validProps(value.event_name as ProductEventName, value.props)
  );
}
