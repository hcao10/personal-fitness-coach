/**
 * The Chinese catalogs are `as const`, which would otherwise demand that every
 * other locale repeat the *same literal strings*. Widening the leaves to
 * `string` keeps what actually matters — identical key sets, identical shape —
 * while letting each locale carry its own text.
 */
export type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
