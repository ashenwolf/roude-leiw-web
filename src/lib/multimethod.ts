class IgnoreField {}

/**
 *
 * __ is constant that means a field ignored in the selector
 *
 */
export const __ = new IgnoreField();

type DispatchFunction<T extends readonly unknown[]> = (...obj: T) => any;
type Method<T extends readonly unknown[]> = (...params: T) => any;
type DispatchClause<T extends readonly unknown[]> = any | Method<T>;
interface MultiMethodProps<T extends readonly unknown[]> {
  methods: DispatchClause<T>[];
  dispatchFunction: DispatchFunction<T>;
  defaultMethod: DispatchFunction<T>;
}

const raiseNoDispatchFound = <T extends readonly unknown[]>(...obj: T): any => {
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

export function multimethod<T extends readonly unknown[]>(
  dispatchFunction: DispatchFunction<T>,
) {
  const data: MultiMethodProps<T> = {
    methods: [],
    dispatchFunction: dispatchFunction,
    defaultMethod: raiseNoDispatchFound,
  };

  /**
   * Helper function to zip two arrays together
   */
  const zip = <A, B>(a: A[], b: B[]): [A, B][] =>
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
  multiMethod.method = (selector: any[], method: Method<T>) => {
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
  multiMethod.default = (method: Method<T>) => {
    data.defaultMethod = method;
    return multiMethod;
  };

  return multiMethod;
}
