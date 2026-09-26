// Same-origin bridge for a real RSS feed. Browsers cannot read BBC RSS
// directly because the feed does not grant cross-origin access.
module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const upstream = await fetch('https://feeds.bbci.co.uk/news/world/rss.xml', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'ObsoleteTechnologyTV/1.0' },
    });
    if (!upstream.ok) throw new Error(`Feed returned ${upstream.status}`);
    const xml = await upstream.text();
    const decode = value => value
      .replace(/^<!\[CDATA\[|\]\]>$/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/<[^>]*>/g, '').trim();
    const headlines = [...xml.matchAll(/<item>\s*<title>([\s\S]*?)<\/title>/g)]
      .map(match => decode(match[1])).filter(Boolean).slice(0, 12);
    if (!headlines.length) throw new Error('Feed contained no headlines');
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return response.status(200).json({ source: 'BBC News World', headlines });
  } catch {
    response.setHeader('Cache-Control', 'no-store');
    return response.status(502).json({ error: 'News feed unavailable' });
  }
};
