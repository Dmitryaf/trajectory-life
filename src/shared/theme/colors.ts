export const chartColors = {
  axis: '#7d8798',
  axisLine: '#dfe4ed',
  deepGreen: '#1d5148',
  energy: '#2eaa7f',
  event: '#eb7458',
  gridLine: '#edf1f6',
  legend: '#657085',
  sleep: '#7467e8',
  weight: '#d9952f',
} as const;

export const chartStyles = {
  axisLabel: { color: chartColors.axis },
  axisLine: { color: chartColors.axisLine },
  splitLine: { color: chartColors.gridLine },
} as const;
