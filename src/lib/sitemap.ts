import { XMLParser } from 'fast-xml-parser'

export async function parseSitemapUrls(sitemapXml: string): Promise<string[]> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' })
  const data = parser.parse(sitemapXml)
  const urls: string[] = []

  const addUrlset = (obj: any) => {
    if (!obj) return
    const locs = Array.isArray(obj.url) ? obj.url : obj.url ? [obj.url] : []
    for (const u of locs) {
      const loc = u.loc
      if (typeof loc === 'string') urls.push(loc)
    }
  }

  const addIndex = (obj: any) => {
    if (!obj) return
    const sitemaps = Array.isArray(obj.sitemap) ? obj.sitemap : obj.sitemap ? [obj.sitemap] : []
    for (const sm of sitemaps) {
      const loc = sm.loc
      if (typeof loc === 'string') urls.push(loc)
    }
  }

  if (data.urlset) addUrlset(data.urlset)
  if (data.sitemapindex) addIndex(data.sitemapindex)

  return Array.from(new Set(urls))
}

