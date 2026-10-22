export function initials(n) {
  return (
    (n || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((x) => x[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}
