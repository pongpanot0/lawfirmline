export function barHeight(value: number, maximum: number, direction: 'positive' | 'negative') {
  if ((direction === 'positive' && value < 0) || (direction === 'negative' && value >= 0)) return 0;
  return Math.abs(value) / Math.max(maximum, 1) * 100;
}
