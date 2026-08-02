import { forwardRef, memo, type ReactNode } from "react";

export interface ArrowButtonProps {
  disabled?: boolean;
  children?: ReactNode;
}
export const ArrowButton = (_props: ArrowButtonProps): JSX.Element =>
  ({}) as JSX.Element;

export interface InputProps {
  value: string;
  onChange(value: string): void;
}
export const ForwardedInput = forwardRef<unknown, InputProps>(
  (_props, _ref) => ({}) as JSX.Element,
);
export const MemoButton = memo(ArrowButton);

export default function DefaultCard(_props: {
  title: string;
  payload: unknown;
}): JSX.Element {
  return {} as JSX.Element;
}

export function CreatePayload(value: string) {
  return { value };
}
export const InternalOption = (_props: { label: string }): JSX.Element =>
  ({}) as JSX.Element;
