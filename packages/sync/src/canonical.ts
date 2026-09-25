/**
 * Deterministic JSON serialisation.
 *
 * A signature covers bytes, and both sides must agree on those bytes exactly.
 * `JSON.stringify` preserves insertion order, so two objects built by different
 * code paths — the server assembling a manifest from a database row, the client
 * parsing one from the wire — can serialise differently and produce a signature
 * mismatch on identical content. Sorting keys removes that class of bug.
 */

/** Values JSON can represent without ambiguity. */
export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

/**
 * Serialise a value with object keys sorted at every level.
 *
 * @param value Value to serialise.
 * @returns Compact JSON with deterministic key order.
 * @throws If the value contains a type JSON cannot round-trip losslessly.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('canonicalJson refuses non-finite numbers');
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();

    const parts = keys.map((key) => {
      const entry = record[key];

      if (entry === undefined) {
        throw new TypeError(`canonicalJson refuses undefined at key "${key}"`);
      }

      return `${JSON.stringify(key)}:${canonicalJson(entry)}`;
    });

    return `{${parts.join(',')}}`;
  }

  throw new TypeError(`canonicalJson cannot represent ${typeof value}`);
}
