export function formatETRDisplay(
  estimatedRecovery: string | number | undefined | null,
  typicalHours?: number,
): string {
  const numericSource = typeof typicalHours === 'number' && isFinite(typicalHours)
    ? Math.abs(typicalHours)
    : null;

  if (numericSource !== null) {
    if (numericSource === 0) return 'No recovery needed';
    if (numericSource < 1) return `~${Math.round(numericSource * 60)} minutes`;
    if (numericSource <= 1.5) return '~1 hour';
    return `~${numericSource.toFixed(1)} hours`;
  }

  const str = String(estimatedRecovery ?? '').toLowerCase().trim();
  if (!str || str === 'undefined' || str === 'null') return 'Calculating...';
  if (str.includes('no recovery')) return 'No recovery needed';

  const raw = parseFloat(str.replace(/[^0-9.]/g, ''));
  if (isNaN(raw)) return str;

  const abs = Math.abs(raw);
  if (abs === 0) return 'No recovery needed';
  if (abs < 1) return `~${Math.round(abs * 60)} minutes`;
  if (abs <= 1.5) return '~1 hour';
  return `~${abs.toFixed(1)} hours`;
}