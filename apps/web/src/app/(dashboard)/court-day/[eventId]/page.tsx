'use client';
import { useParams } from 'next/navigation';
import { CourtDayPanel } from '@/components/court-day/CourtDayPanel';
export default function CourtDayPage() {
  const { eventId } = useParams<{ eventId: string }>();
  return <CourtDayPanel key={eventId} eventId={eventId} />;
}
