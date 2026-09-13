export const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return Number(value) || 0;
};

export const formatDateTime = (value) => {
  const ms = toMillis(value);
  if (!ms) return '-';
  return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export const timeAgo = (value) => {
  const ms = toMillis(value);
  if (!ms) return '-';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
