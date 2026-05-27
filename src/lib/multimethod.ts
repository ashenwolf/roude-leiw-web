class IgnoreField {}

/**
 *
 * __ is constant that means a field ignored in the selector
 *
 */
export const __ = new IgnoreField();

type DispatchValue = readonly unknown[];
type DispatchFunction<T extends readonly unknown[]> = (...obj: T) => DispatchValue;
type Method<T extends readonly unknown[], R> = (...params: T) => R;
type DispatchClause<T extends readonly unknown[], R> = [DispatchValue, Method<T, R>];
interface MultiMethodProps<T extends readonly unknown[], R> {
  methods: DispatchClause<T, R>[];
  dispatchFunction: DispatchFunction<T>;
  defaultMethod: Method<T, R>;
}

const raiseNoDispatchFound = <T extends readonly unknown[]>(...obj: T): never => {
  throw new Error(
    `No method found matching these parameters: ${JSON.stringify(obj)}`,
  );
};

/**
 * Creates the multiple dispatch function (multimethod)
 *
 * @param dispatchFunction a function that generates the dispatch value from input multimethod parameter.
 *
 * @returns a chainable callabale function with following methods defined below.
 *
 * Example:
 * ```
 * const hello = multimethod((value) => [value.language.toLowerCase(), value.timeofday.toLowerCase()])
 *        .method(["en", __], ({name}) => `Hello ${name}.`)
 *        .method(["fr", "morning"], ({name}) => `Bonjour ${name}!`)
 *        .method(["fr", "evening"], ({name}) => `Bonsoir ${name}!`)
 *        .default(({name}) => `Ciao ${name}!`)
 *
 * hello({language: "it", timeofday: "Morning", name: "Luke"})  // --> Ciao Luke!
 * hello({language: "FR", timeofday: "Morning", name: "John"})  // --> Bonjour John!
 * hello({language: "fr", timeofday: "evening", name: "John"})  // --> Bonsoir John!
 * hello({language: "en", timeofday: "morning", name: "John"})  // --> Hello John.
 * ```
 *
 */

export function multimethod<T extends readonly unknown[], R = unknown>(
  dispatchFunction: DispatchFunction<T>,
) {
  const data: MultiMethodProps<T, R> = {
    methods: [],
    dispatchFunction: dispatchFunction,
    defaultMethod: raiseNoDispatchFound as Method<T, R>,
  };

  /**
   * Helper function to zip two arrays together
   */
  const zip = <A, B>(a: readonly A[], b: readonly B[]): [A, B][] =>
    Array.from({ length: Math.min(a.length, b.length) }, (_, i) => [a[i], b[i]]);

  const multiMethod = (...objs: T) => {
    const dispatchValue = data.dispatchFunction(...objs);
    const entry = data.methods.find(([matchValue]) => {
      return zip(matchValue, dispatchValue).every(
        ([comp, base]) => comp === __ || comp === base,
      );
    });
    const method = entry?.[1] || data.defaultMethod;
    return method(...objs);
  };

  /**
   * Adds a dispatchable call when dispatched object matches dispatchValue
   *
   * @param selector to be matched against.
   * @param method actual implementation of the multimethod call for given selector.
   */
  multiMethod.method = (selector: DispatchValue, method: Method<T, R>) => {
    data.methods.push([selector, method]);
    return multiMethod;
  };

  /**
   * Redefines a default behavior when object does not match any dispatchValue.
   *
   * Default behavior is to throw an exception.
   *
   * @param method actual implementation of default multimethod call
   */
  multiMethod.default = (method: Method<T, R>) => {
    data.defaultMethod = method;
    return multiMethod;
  };

  return multiMethod;
}
