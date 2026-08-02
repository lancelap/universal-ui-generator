export interface FilterPanelProps {
  filters: string[];
  onChange(filters: string[]): void;
}

export const FilterPanel = (_props: FilterPanelProps): JSX.Element =>
  ({}) as JSX.Element;
