import { redirect } from 'next/navigation';

export default async function CaseBillingRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/cases/${id}?tab=billing`);
}
