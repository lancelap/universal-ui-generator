declare namespace JSX {
  interface Element {
    readonly __jsx: unique symbol;
  }
}
declare module "react" {
  export type ReactNode = JSX.Element | string | number | boolean | null;
  export type ReactElement = JSX.Element;
  export type FC<P = {}> = (props: P) => JSX.Element;
  export function forwardRef<T, P>(
    render: (props: P, ref: T) => JSX.Element,
  ): (props: P) => JSX.Element;
  export function memo<P>(
    component: (props: P) => JSX.Element,
  ): (props: P) => JSX.Element;
}
