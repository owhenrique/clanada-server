export function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    const swapped = result[j];
    if (temp === undefined || swapped === undefined) {
      throw new Error("invariant: shuffle index out of bounds");
    }
    result[i] = swapped;
    result[j] = temp;
  }
  return result;
}
