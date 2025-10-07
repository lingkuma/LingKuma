import { defineConfig } from 'vitepress'
//https://github.com/vuejs/vitepress/blob/main/docs/.vitepress/config/zh.ts#L161C2-L205C2
export const enSearch = {
    en: {
        placeholder: 'Search documentation',
        translations: {
            button: {
                buttonText: 'Search documentation',
                buttonAriaLabel: 'Search documentation'
            },
            modal: {
                searchBox: {
                    resetButtonTitle: 'Clear query',
                    resetButtonAriaLabel: 'Clear query',
                    cancelButtonText: 'Cancel',
                    cancelButtonAriaLabel: 'Cancel'
                },
                startScreen: {
                    recentSearchesTitle: 'Search history',
                    noRecentSearchesText: 'No search history',
                    saveRecentSearchButtonTitle: 'Save to search history',
                    removeRecentSearchButtonTitle: 'Remove from search history',
                    favoriteSearchesTitle: 'Favorites',
                    removeFavoriteSearchButtonTitle: 'Remove from favorites'
                },
                errorScreen: {
                    titleText: 'Unable to get results',
                    helpText: 'You may need to check your network connection'
                },
                footer: {
                    selectText: 'Select',
                    navigateText: 'Navigate',
                    closeText: 'Close',
                    searchByText: 'Search provider'
                },
                noResultsScreen: {
                    noResultsText: 'No results found',
                    suggestedQueryText: 'You can try searching for',
                    reportMissingResultsText: 'Do you think this query should have results?',
                    reportMissingResultsLinkText: 'Click to report'
                }
            }
        }
    }
}
export const en = defineConfig({
    description: "Learn any language on the web - Multi-platform support, AI parsing, PDF, EPUB, Youtube",
    titleTemplate: ":title - LingKuma",
    themeConfig: {
        outline: {
            level: [2, 3],
            label: "Page Navigation"
        },
        footer: {
            copyright: `💡 Inspired by Lingq but: Better web compatibility, AI parsing, PDF, EPUB, Youtube ·····`
        },

        editLink: {
            pattern: 'https://github.com/lingkuma/LingKuma/edit/main/docs/:path',
            text: 'Edit this page on GitHub'
        },

        docFooter: {
            prev: 'Previous',
            next: 'Next'
        },

        lastUpdated: {
            text: 'Last updated',
            formatOptions: {
                dateStyle: 'short',
                timeStyle: 'medium'
            }
        },
        nav: [
            { text: "Video Tutorial", link: "https://www.youtube.com/watch?v=RHh3Upabtfk" },
            { text: "Tg", link: "https://tg.lingkuma.org/" },
            { text: "Discord", link: "https://dc.lingkuma.org/" },

            { text: "Support the Author", link: "/en/support" },
        ],
        sidebar: [

            {
                text: 'Introduction',
                items: [
                    { text: 'Introduction', link: '/en/init/Lingkuma/Lingkuma' },
                    { text: 'Latest Updates', link: '/en/init/new/new' },
                ]
            },

            {
                text: 'Getting Started',
                items: [
                    { text: 'User Guide', link: '/en/intro/start/start' },
                    { text: 'E-books', link: '/en/intro/ebook/ebook' },
                    { text: 'Recommended Software', link: '/en/intro/supportList/supportList' },


                ]
            },
            {
                text: 'Detailed',
                items: [
                    {
                        text: 'Multi-platform', link: '/en/more/platform/platform',

                    },
                    {
                        text: 'Live Captions', link: '/en/more/WindowsCaptions/WindowsCaptions'

                    },


                ]
            },
            {
                text: 'Announcements',
                items: [

                    { text: 'Changelog', link: '/en/server/log/log' },

                    { text: 'Terms of Service', link: '/en/server/service' },
                    { text: 'Privacy Policy', link: '/en/server/privacy' }
                ]
            }
        ]
    }
})