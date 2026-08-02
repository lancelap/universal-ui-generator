declare namespace JSX {
  interface Element {
    readonly __jsx: unique symbol;
  }
}

declare module "react" {
  export type ReactNode = JSX.Element | string | number | boolean | null;
  export type ReactElement = JSX.Element;
  export type FC<P = {}> = (props: P) => JSX.Element;
}
