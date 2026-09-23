import { redirect } from 'next/navigation';

export default function WorkInboxRedirect() {
  redirect('/todos');
}
