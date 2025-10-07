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
    // 优先级: frontmatter.ogImage > 动态生成 > 默认图片
    let ogImageUrl: string

    if (pageData.frontmatter.ogImage) {
      // 如果页面指定了自定义图片
      ogImageUrl = pageData.frontmatter.ogImage
    } else {
      // 使用 Vercel OG Image 服务自动生成
      // 参数说明:
      // - theme=dark: 深色主题
      // - md=1: 启用 Markdown 渲染
      // - fontSize=100px: 字体大小
      // - images: Logo 图片 URL
      const encodedTitle = encodeURIComponent(ogTitle)
      const logoUrl = encodeURIComponent('https://docs.lingkuma.org/icon32.png')
      ogImageUrl = `https://og-image.vercel.app/${encodedTitle}.png?theme=dark&md=1&fontSize=100px&images=${logoUrl}`
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
      { icon: 'github', link: 'https://github.com/lingkuma/LingKuma' }
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