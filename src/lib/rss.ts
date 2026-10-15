import { BLOG_POSTS } from '@/data/blog-posts';
import { SITE_URL } from '@/lib/site-config';

export function generateRssFeed(): string {
  const baseUrl = SITE_URL;
  const siteTitle = 'Leads4dev Developer Blog';
  const siteDescription = 'Practical guides, pricing benchmarks, and outreach strategies for Egyptian web developers.';
  const feedUrl = `${baseUrl}/feed.xml`;

  const latestPostDate = BLOG_POSTS.length > 0
    ? new Date(BLOG_POSTS[0].publishedAt).toUTCString()
    : new Date().toUTCString();

  const itemsXml = BLOG_POSTS.map((post) => {
    const postUrl = `${baseUrl}/blog/${post.slug}`;
    const pubDate = new Date(post.publishedAt).toUTCString();

    return `
    <item>
      <title><![CDATA[${post.titleAr}]]></title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${post.excerptAr}]]></description>
      <category><![CDATA[${post.category}]]></category>
      <author>team@leads4dev.com (${post.author.name})</author>
    </item>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${siteTitle}</title>
    <link>${baseUrl}/blog</link>
    <description>${siteDescription}</description>
    <language>ar-EG</language>
    <lastBuildDate>${latestPostDate}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
    ${itemsXml}
  </channel>
</rss>`.trim();
}
