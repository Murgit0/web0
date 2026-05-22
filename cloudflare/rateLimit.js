const buckets = new Map();

export function checkRateLimit(key, limit = 30, windowMs = 600000) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > limit) return false;
  return true;
}
