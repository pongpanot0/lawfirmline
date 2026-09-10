import { redirect } from 'next/navigation';

export default async function CaseTasksRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/cases/${id}?tab=tasks`);
}
