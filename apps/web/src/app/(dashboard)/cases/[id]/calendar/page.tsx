import { redirect } from 'next/navigation';

export default async function CaseCalendarRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { id } = await params;
  const { eventId } = await searchParams;
  redirect(`/cases/${id}?tab=calendar${eventId ? `&eventId=${encodeURIComponent(eventId)}` : ''}`);
}
