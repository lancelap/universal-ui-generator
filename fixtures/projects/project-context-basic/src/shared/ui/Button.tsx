export interface ButtonProps {
  label: string;
  disabled?: boolean;
  onClick?(): void;
}

export const Button = (_props: ButtonProps): JSX.Element => ({}) as JSX.Element;
