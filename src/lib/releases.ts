import "server-only";

/**
 * Orders version names the way people read them, not the way strings sort.
 *
 * Plain string ordering puts 1.10 before 1.9, which is wrong for every
 * versioning scheme anyone actually uses. This compares digit runs as numbers
 * and everything else as text, so "v1.9" < "v1.10" and "2.0-beta" < "2.0".
 * No format is imposed — names that share no structure just fall back to
 * comparing as text.
 */
export function compareVersions(a: string, b: string) {
  const chunk = (value: string) =>
    value
      .toLowerCase()
      // A leading "v" is decoration: v1.2 and 1.2 are the same version.
      .replace(/^v(?=\d)/, "")
      .split(/(\d+)/)
      .filter(Boolean)
      .map((part) => (/^\d+$/.test(part) ? Number(part) : part));

  const left = chunk(a);
  const right = chunk(b);

  /**
   * When one name runs out, what the other has left decides it. More numbers
   * means a later version (1 < 1.9). Letters mean a pre-release, which comes
   * *before* the plain version (2.0-beta < 2.0).
   */
  const tail = (parts: (string | number)[], from: number) =>
    /[a-z]/.test(parts.slice(from).join("")) ? -1 : 1;

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i];
    const y = right[i];
    if (x === undefined) return -tail(right, i);
    if (y === undefined) return tail(left, i);

    if (typeof x === "number" && typeof y === "number") {
      if (x !== y) return x - y;
      continue;
    }
    const xs = String(x);
    const ys = String(y);
    if (xs !== ys) return xs < ys ? -1 : 1;
  }
  return 0;
}

export function sortReleases<T extends { name: string }>(releases: T[]) {
  return [...releases].sort((a, b) => compareVersions(a.name, b.name));
}
