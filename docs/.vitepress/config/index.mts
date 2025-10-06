import { defineConfig } from 'vitepress'
import { en } from './en'
import { zh, zhSearch } from './zh'
import { ja, jaSearch } from './ja'
import { cht, chtSearch } from './cht'
import { tabsMarkdownPlugin } from 'vitepress-plugin-tabs'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/',
  title: "LingKuma",
  head: [
    ['link', { rel: 'icon', href: '/icon32.png' }],
  ],
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