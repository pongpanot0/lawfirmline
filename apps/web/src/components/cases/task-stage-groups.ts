export function taskStageGroups<T extends { labels: string[] }>(tasks: T[], currentStage?: string | null) {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const stage = task.labels.find((label) => label.startsWith('stage:'))?.slice(6) || '';
    groups.set(stage, [...(groups.get(stage) ?? []), task]);
  }
  return [...groups].sort(([a], [b]) => Number(b === currentStage) - Number(a === currentStage));
}
