import type { Metadata } from 'next';
import { PROGRAMMATIC_CITIES } from '@/lib/programmatic';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const isCity = Boolean(PROGRAMMATIC_CITIES[params.id]);
  // Lead details (/leads/<id>) must always be noindex
  if (!isCity) {
    return {
      robots: {
        index: false,
        follow: false,
      },
    };
  }
  return {};
}

export default function LeadDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
