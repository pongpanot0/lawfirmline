import { redirect } from 'next/navigation';

// Intake is retired: every matter opens directly as a case at the ก่อนฟ้อง stage.
export default function NewIntakePage() {
  redirect('/cases/new');
}
