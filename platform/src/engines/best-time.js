import { clampScore } from '../core/validate.js';

/**
 * Best Time To Post engine (§23).
 *
 * Learns from the client's own published performance, per platform and content
 * type. With too little history it says so and falls back to a stated default
 * rather than inventing a confident-sounding time.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MIN_SAMPLES = 6;

/** Documented defaults, used only while a client has no history of their own. */
const FALLBACK = {
  instagram: { day: 2, hour: 19 }, facebook: { day: 3, hour: 13 },
  linkedin: { day: 2, hour: 10 }, x: { day: 3, hour: 9 },
  threads: { day: 4, hour: 20 }, youtube: { day: 6, hour: 18 },
  reddit: { day: 2, hour: 15 }, quora: { day: 2, hour: 11 },
};

/**
 * @param {{
 *   history: {published_at:string, engagement:number, platform:string, content_type:string}[],
 *   platform: string, contentType?: string, timezoneOffsetMinutes?: number,
 * }} input
 */
export function bestTimeToPost(input) {
  const offset = Number(input.timezoneOffsetMinutes ?? 0);
  const relevant = (input.history ?? []).filter((h) =>
    h.platform === input.platform &&
    (!input.contentType || h.content_type === input.contentType) &&
    h.published_at);

  if (relevant.length < MIN_SAMPLES) {
    const fb = FALLBACK[input.platform] ?? { day: 2, hour: 18 };
    return {
      day: DAYS[fb.day],
      day_index: fb.day,
      hour: fb.hour,
      minute: 30,
      confidence: clampScore(25 + relevant.length * 5),
      sample_size: relevant.length,
      source: 'default',
      reason: `Only ${relevant.length} published ${input.platform} posts so far — using the platform default until there are at least ${MIN_SAMPLES}.`,
    };
  }

  /** @type {Map<string, {total:number, n:number}>} */
  const buckets = new Map();
  for (const row of relevant) {
    const local = new Date(new Date(row.published_at).getTime() + offset * 60_000);
    const key = `${local.getUTCDay()}:${local.getUTCHours()}`;
    const bucket = buckets.get(key) ?? { total: 0, n: 0 };
    bucket.total += Number(row.engagement ?? 0);
    bucket.n += 1;
    buckets.set(key, bucket);
  }

  const ranked = [...buckets.entries()]
    .map(([key, b]) => {
      const [day, hour] = key.split(':').map(Number);
      return { day, hour, average: b.total / b.n, samples: b.n };
    })
    // A single lucky post should not define the client's posting schedule.
    .filter((b) => b.samples >= 2 || relevant.length < 12)
    .sort((a, b) => b.average - a.average);

  const best = ranked[0];
  if (!best) {
    const fb = FALLBACK[input.platform] ?? { day: 2, hour: 18 };
    return {
      day: DAYS[fb.day], day_index: fb.day, hour: fb.hour, minute: 30,
      confidence: 30, sample_size: relevant.length, source: 'default',
      reason: 'History is too scattered to identify a reliable window.',
    };
  }

  const overallAverage = relevant.reduce((n, r) => n + Number(r.engagement ?? 0), 0) / relevant.length;
  const lift = overallAverage > 0 ? best.average / overallAverage : 1;
  const confidence = clampScore(35 + Math.min(relevant.length, 40) + (lift - 1) * 40);

  return {
    day: DAYS[best.day],
    day_index: best.day,
    hour: best.hour,
    minute: 30,
    confidence,
    sample_size: relevant.length,
    source: 'history',
    lift: Number(lift.toFixed(2)),
    alternatives: ranked.slice(1, 4).map((b) => ({ day: DAYS[b.day], hour: b.hour, average: Number(b.average.toFixed(1)) })),
    reason: `Across ${relevant.length} published ${input.platform} posts, ${DAYS[best.day]} around ${formatHour(best.hour)} averages ${best.average.toFixed(1)} engagements — ${lift.toFixed(1)}x this client's overall average.`,
  };
}

/** Next occurrence of the recommended slot, as an ISO timestamp. */
export function nextSlot(recommendation, from = new Date(), offsetMinutes = 0) {
  const base = new Date(from.getTime() + offsetMinutes * 60_000);
  const result = new Date(base);
  const delta = (recommendation.day_index - base.getUTCDay() + 7) % 7;
  result.setUTCDate(base.getUTCDate() + delta);
  result.setUTCHours(recommendation.hour, recommendation.minute ?? 0, 0, 0);
  if (result <= base) result.setUTCDate(result.getUTCDate() + 7);
  return new Date(result.getTime() - offsetMinutes * 60_000).toISOString();
}

function formatHour(h) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${suffix}`;
}

export { DAYS, FALLBACK, MIN_SAMPLES };
