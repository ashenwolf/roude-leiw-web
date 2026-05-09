export const shuffle = <T>(xs: ReadonlyArray<T>): T[] =>
  xs
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
