import { defineConfig } from 'vitepress'
//https://github.com/vuejs/vitepress/blob/main/docs/.vitepress/config/zh.ts#L161C2-L205C2
export const chtSearch = {
    cht: {
        placeholder: '搜尋文件',
        translations: {
            button: {
                buttonText: '搜尋文件',
                buttonAriaLabel: '搜尋文件'
            },
            modal: {
                searchBox: {
                    resetButtonTitle: '清除查詢條件',
                    resetButtonAriaLabel: '清除查詢條件',
                    cancelButtonText: '取消',
                    cancelButtonAriaLabel: '取消'
                },
                startScreen: {
                    recentSearchesTitle: '搜尋歷史',
                    noRecentSearchesText: '沒有搜尋歷史',
                    saveRecentSearchButtonTitle: '儲存至搜尋歷史',
                    removeRecentSearchButtonTitle: '從搜尋歷史中移除',
                    favoriteSearchesTitle: '我的最愛',
                    removeFavoriteSearchButtonTitle: '從我的最愛中移除'
                },
                errorScreen: {
                    titleText: '無法取得結果',
                    helpText: '您可能需要檢查您的網路連接'
                },
                footer: {
                    selectText: '選擇',
                    navigateText: '切換',
                    closeText: '關閉',
                    searchByText: '搜尋提供者'
                },
                noResultsScreen: {
                    noResultsText: '無法找到相關結果',
                    suggestedQueryText: '您可以嘗試查詢',
                    reportMissingResultsText: '您認為該查詢應該有結果？',
                    reportMissingResultsLinkText: '點擊回饋'
                }
            }
        }
    }
}
export const cht = defineConfig({
    themeConfig: {
        outline: {
            level: [2, 3],
            label: "頁面導覽"
        },
        footer: {
            copyright: `💡 啟發於 Lingq 但：更好的網頁兼容，AI解析，PDF，EPUB，Youtube ·····`
        },

        editLink: {
            pattern: 'https://github.com/lingkuma/LingKuma/edit/main/docs/:path',
            text: '在 GitHub 上編輯此頁面'
        },

        docFooter: {
            prev: '上一頁',
            next: '下一頁'
        },

        lastUpdated: {
            text: '最後更新於',
            formatOptions: {
                dateStyle: 'short',
                timeStyle: 'medium'
            }
        },
        nav: [
            { text: "影片教學", link: "https://www.bilibili.com/video/BV1RGZ8YbEGh/" },
            { text: "tg", link: "https://tg.lingkuma.org/" },
            { text: "Discord", link: "https://dc.lingkuma.org/" },

            { text: "支持作者", link: "/cht/support" },
        ],
        sidebar: [

            {
                text: '介紹',
                items: [
                    { text: '介紹', link: '/cht/init/Lingkuma/Lingkuma' },
                    { text: '最新更新介紹', link: '/cht/init/new/new' },
                ]
            },

            {
                text: '入門必看',
                items: [
                    { text: '上手指南', link: '/cht/intro/start/start' },
                    { text: '電子書', link: '/cht/intro/ebook/ebook' },
                    { text: '軟體推薦', link: '/cht/intro/supportList/supportList' },


                ]
            },
            {
                text: '詳細的',
                items: [
                    {
                        text: '多平台', link: '/cht/more/platform/platform',

                    },
                    {
                        text: '實時字幕', link: '/cht/more/WindowsCaptions/WindowsCaptions'

                    },


                ]
            },
            {
                text: '告示',
                items: [

                    { text: '日誌詳情', link: '/cht/server/log/log' },

                    { text: '服務條款', link: '/cht/server/service' },
                    { text: '隱私政策', link: '/cht/server/privacy' }
                ]
            }
        ]
    }
})