export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`tag status-${value}`}>
      <span className="status-dot" aria-hidden="true" />
      {value.replaceAll("_", " ")}
    </span>
  );
}
