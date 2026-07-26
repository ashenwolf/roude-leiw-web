export const shuffle = <T>(xs: ReadonlyArray<T>, rng: () => number = Math.random): T[] =>
  xs
    .map((value) => ({ value, sort: rng() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
