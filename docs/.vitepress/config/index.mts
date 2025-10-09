import { defineConfig } from 'vitepress'
import type { HeadConfig } from 'vitepress'
import { en } from './en'
import { zh, zhSearch } from './zh'
import { ja, jaSearch } from './ja'
import { cht, chtSearch } from './cht'
import { tabsMarkdownPlugin } from 'vitepress-plugin-tabs'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/',
  title: "LingKuma",
  description: "Learn any language on the web - Better web compatibility, AI parsing, PDF, EPUB, Youtube support",
  sitemap: {
    hostname: 'https://docs.lingkuma.org'
  },
  head: [
    ['link', { rel: 'icon', href: '/icon32.png' }],
    ['meta', { name: 'description', content: 'Learn any language on the web with LingKuma - Multi-platform support, AI parsing, PDF, EPUB, Youtube and more' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'LingKuma' }],
  ],

  transformHead: ({ pageData }): HeadConfig[] => {
    const head: HeadConfig[] = []

    // 动态设置 og:title
    const ogTitle = pageData.frontmatter.title || pageData.title || 'LingKuma - Learn any language on the web'
    head.push(['meta', { property: 'og:title', content: ogTitle }])

    // 动态设置 og:description
    const ogDescription = pageData.frontmatter.description || pageData.description || 'Multi-platform language learning tool with AI parsing, PDF, EPUB, Youtube support'
    head.push(['meta', { property: 'og:description', content: ogDescription }])

    // 动态设置 og:url
    const canonicalUrl = `https://docs.lingkuma.org/${pageData.relativePath.replace(/\.md$/, '.html')}`
    head.push(['meta', { property: 'og:url', content: canonicalUrl }])
    head.push(['link', { rel: 'canonical', href: canonicalUrl }])

    // 动态设置 og:image
    // 优先级: frontmatter.ogImage > 动态生成
    let ogImageUrl: string

    if (pageData.frontmatter.ogImage) {
      // 如果页面指定了自定义图片
      ogImageUrl = pageData.frontmatter.ogImage
    } else {
      // 使用 og-image-one.vercel.app 服务自动生成
      // 参数说明:
      // - theme=light: 浅色主题
      // - md=1: 启用 Markdown 渲染
      // - fontSize=100px: 字体大小
      // - layoutMode=ab-image: 布局模式
      // - images: Logo 图片 URL (需要 URL encode)
      const encodedTitle = encodeURIComponent(ogTitle)
      const obImageUrl = 'https%3A%2F%2Fdocs.lingkuma.org%2Fog1.png'
      const iconUrl = 'https%3A%2F%2Fdocs.lingkuma.org%2Ficon32.png'
      ogImageUrl = `https://og-image-one.vercel.app/${encodedTitle}.png?theme=light&md=1&fontSize=100px&layoutMode=ab-image&images=${obImageUrl}&images=${iconUrl}`
    }

    head.push(['meta', { property: 'og:image', content: ogImageUrl }])
    head.push(['meta', { property: 'og:image:width', content: '1200' }])
    head.push(['meta', { property: 'og:image:height', content: '630' }])
    head.push(['meta', { property: 'og:image:alt', content: ogTitle }])

    // Twitter Card
    head.push(['meta', { name: 'twitter:card', content: 'summary_large_image' }])
    head.push(['meta', { name: 'twitter:title', content: ogTitle }])
    head.push(['meta', { name: 'twitter:description', content: ogDescription }])
    head.push(['meta', { name: 'twitter:image', content: ogImageUrl }])

    return head
  },
  rewrites: {
    //  'zh/:rest*': ':rest*'
  },

  lastUpdated: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    socialLinks: [
      { icon: 'github', link: 'https://github.com/lingkuma/LingKuma' },
      {
        icon: {
          svg: '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Telegram</title><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>'
        },
        link: 'https://tg.lingkuma.org/'
      },
      { icon: 'discord', link: 'https://dc.lingkuma.org/' }
    ],
    outline: {
      level: [2, 3],
    },
    search: {
      provider: 'local', options: {
        locales: {
          ...zhSearch,
          ...jaSearch,
          ...chtSearch,
        }
      }
    },
    logo: '/icon32.png'
  },

  locales: {
    zh: { label: '简体中文', ...zh },
    cht: { label: '繁體中文', ...cht },
    en: { label: 'English', ...en },
    ja: { label: '日本語', ...ja },
  },
  ignoreDeadLinks: true,
  markdown: {
    config(md) {
      md.use(tabsMarkdownPlugin)
    }
  }
})