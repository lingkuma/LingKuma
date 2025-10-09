import { defineConfig } from 'vitepress'
//https://github.com/vuejs/vitepress/blob/main/docs/.vitepress/config/zh.ts#L161C2-L205C2
export const zhSearch = {
    zh: {
        placeholder: '搜索文档',
        translations: {
            button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档'
            },
            modal: {
                searchBox: {
                    resetButtonTitle: '清除查询条件',
                    resetButtonAriaLabel: '清除查询条件',
                    cancelButtonText: '取消',
                    cancelButtonAriaLabel: '取消'
                },
                startScreen: {
                    recentSearchesTitle: '搜索历史',
                    noRecentSearchesText: '没有搜索历史',
                    saveRecentSearchButtonTitle: '保存至搜索历史',
                    removeRecentSearchButtonTitle: '从搜索历史中移除',
                    favoriteSearchesTitle: '收藏',
                    removeFavoriteSearchButtonTitle: '从收藏中移除'
                },
                errorScreen: {
                    titleText: '无法获取结果',
                    helpText: '你可能需要检查你的网络连接'
                },
                footer: {
                    selectText: '选择',
                    navigateText: '切换',
                    closeText: '关闭',
                    searchByText: '搜索提供者'
                },
                noResultsScreen: {
                    noResultsText: '无法找到相关结果',
                    suggestedQueryText: '你可以尝试查询',
                    reportMissingResultsText: '你认为该查询应该有结果？',
                    reportMissingResultsLinkText: '点击反馈'
                }
            }
        }
    }
}
export const zh = defineConfig({
    description: "在网页学习任何语言 - 多平台支持，AI解析，PDF，EPUB，Youtube",
    titleTemplate: ":title - LingKuma",
    themeConfig: {
        outline: {
            level: [2, 3],
            label: "页面导航"
        },
        footer: {
            copyright: `💡 启发于 Lingq 但：更好的网页兼容，AI解析，PDF，EPUB，Youtube ·····`
        },

        editLink: {
            pattern: 'https://github.com/lingkuma/LingKuma/edit/main/docs/:path',
            text: '在 GitHub 上编辑此页面'
        },

        docFooter: {
            prev: '上一页',
            next: '下一页'
        },

        lastUpdated: {
            text: '最后更新于',
            formatOptions: {
                dateStyle: 'short',
                timeStyle: 'medium'
            }
        },
        nav: [
            { text: "视频教程", link: "https://www.bilibili.com/video/BV1RGZ8YbEGh/" },
            { text: "支持作者", link: "/zh/support" },
        ],
        sidebar: [

            {
                text: '介绍',
                items: [
                    { text: '介绍', link: '/zh/init/Lingkuma/Lingkuma' },
                    { text: '最新更新介绍', link: '/zh/init/new/new' },
                ]
            },
            
            {
                text: '入门必看',
                items: [
                    { text: '上手指南', link: '/zh/intro/start/start' },
                    { text: '电子书', link: '/zh/intro/ebook/ebook' },
                    { text: '软件推荐', link: '/zh/intro/supportList/supportList' },

                
                ]       
            },
            {
                text: '详细的',
                items: [
                    {
                        text: '多平台', link: '/zh/more/platform/platform',
                       
                    },
                    {
                        text: '实时字幕', link: '/zh/more/WindowsCaptions/WindowsCaptions'
                        
                    },
                    
                
                ]
            },
            {
                text: '告示',
                items: [
   
                    { text: '日志详情', link: '/zh/server/log/log' },
                
                    { text: '服务条款', link: '/zh/server/service' },
                    { text: '隐私政策', link: '/zh/server/privacy' }
                ]
            }
        ]
    }
})