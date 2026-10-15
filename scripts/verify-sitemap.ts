import sitemap from '../src/app/sitemap';

async function main() {
  console.log('Testing sitemap generation...');
  const entries = await sitemap();
  console.log(`Generated ${entries.length} sitemap entries:`);
  for (const e of entries) {
    console.log(` - ${e.url} [lastmod: ${e.lastModified ? new Date(e.lastModified).toISOString() : 'none'}]`);
    if ((e as any).priority || (e as any).changeFrequency) {
      throw new Error(`Found deprecated priority or changeFrequency in ${e.url}`);
    }
    if (!e.url.startsWith('https://www.leads4dev.com')) {
      throw new Error(`URL does not start with https://www.leads4dev.com: ${e.url}`);
    }
  }

  // Ensure cairo/other and giza/real-estate are NOT in the sitemap
  const urls = entries.map(e => e.url);
  if (urls.includes('https://www.leads4dev.com/leads/cairo/other')) {
    throw new Error('cairo/other must NOT be in sitemap');
  }
  if (urls.includes('https://www.leads4dev.com/leads/giza/real-estate')) {
    throw new Error('giza/real-estate must NOT be in sitemap');
  }

  console.log('Sitemap verified successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
