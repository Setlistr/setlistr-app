// Pure, framework-free dirty-field diffing for profile save handlers —
// deliberately isolated from any React state so it's directly unit
// testable without a component harness. A field is included in the patch
// only if its current value differs from the value it was hydrated with;
// hydration itself never produces a dirty field, since the "loaded"
// snapshot IS the current value at that moment (diff against yourself is
// always empty).
//
// `undefined` values in `current` are ignored (treated as "this section
// doesn't touch that field"), so a single diff call can be reused across
// Settings' several independent save sections without each one having to
// enumerate every other section's fields.
export function diffFields<T extends Record<string, unknown>>(
  loaded: T,
  current: Partial<T>,
): Partial<T> {
  const patch: Partial<T> = {}
  for (const key of Object.keys(current) as (keyof T)[]) {
    if (current[key] === undefined) continue
    if (current[key] !== loaded[key]) {
      patch[key] = current[key] as T[keyof T]
    }
  }
  return patch
}

// Converts a diffFields() patch (raw-string domain — empty string means
// "cleared", matching what a text input holds) into the wire format the
// server route expects, where a nullable text column is written as `null`
// rather than `''` when the user clears it. Keys not in `nullableOnEmpty`
// (e.g. numeric fields, or fields with no null-means-cleared semantics)
// pass through unchanged.
export function toWirePayload<T extends Record<string, unknown>>(
  patch: Partial<T>,
  nullableOnEmpty: ReadonlySet<keyof T>,
): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'string' && value === '' && nullableOnEmpty.has(key as keyof T)) {
      out[key] = null
    } else {
      out[key] = value as string | number | null
    }
  }
  return out
}
