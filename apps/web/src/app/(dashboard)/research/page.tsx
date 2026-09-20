import { redirect } from 'next/navigation';

// Keep old bookmarks usable; research now starts inside a matter.
export default function ResearchPage() {
  redirect('/intake');
}
