export function StatusBadge({ value }: { value: string }) {
  return <span className={`tag status-${value}`}>{value.replaceAll("_", " ")}</span>;
}
