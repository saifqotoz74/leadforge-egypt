import { generateRssFeed } from '@/lib/rss';

export const dynamic = 'force-static';

export async function GET() {
  const rssXml = generateRssFeed();

  return new Response(rssXml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate',
    },
  });
}
