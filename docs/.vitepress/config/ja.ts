import { defineConfig } from 'vitepress'
export const jaSearch = {
    ja: {
        placeholder: 'ドキュメントを検索',
        translations: {
            button: {
                buttonText: 'ドキュメントを検索',
                buttonAriaLabel: 'ドキュメントを検索'
            },
            modal: {
                searchBox: {
                    resetButtonTitle: '検索条件をクリア',
                    resetButtonAriaLabel: '検索条件をクリア',
                    cancelButtonText: 'キャンセル',
                    cancelButtonAriaLabel: 'キャンセル'
                },
                startScreen: {
                    recentSearchesTitle: '検索履歴',
                    noRecentSearchesText: '検索履歴はありません',
                    saveRecentSearchButtonTitle: '検索履歴に保存',
                    removeRecentSearchButtonTitle: '検索履歴から削除',
                    favoriteSearchesTitle: 'お気に入り',
                    removeFavoriteSearchButtonTitle: 'お気に入りから削除'
                },
                errorScreen: {
                    titleText: '結果を取得できません',
                    helpText: 'ネットワーク接続を確認してください'
                },
                footer: {
                    selectText: '選択',
                    navigateText: '切り替え',
                    closeText: '閉じる',
                    searchByText: '検索プロバイダ'
                },
                noResultsScreen: {
                    noResultsText: '関連する結果が見つかりません',
                    suggestedQueryText: '以下のクエリを試してみてください',
                    reportMissingResultsText: 'このクエリに結果があるべきだと思いますか？',
                    reportMissingResultsLinkText: 'フィードバックを送信'
                }
            }
        }
    }
}
export const ja = defineConfig({
    description: "ウェブサイトで学ぶ、あらゆる言語 - マルチプラットフォーム対応、AI解析、PDF、EPUB、Youtube",
    titleTemplate: ":title - LingKuma",
    themeConfig: {
        outline: {
            level: [2, 3],
            label: "ページナビゲーション"
        },
        footer: {
            copyright: `💡 Lingqにインスパイアされたが：より良いウェブ互換性、AI解析、PDF、EPUB、Youtube ·····`
        },
        editLink: {
            pattern: 'https://github.com/lingkuma/LingKuma/edit/main/docs/:path',
            text: 'GitHubでこのページを編集'
        },

        docFooter: {
            prev: '前のページ',
            next: '次のページ'
        },

        lastUpdated: {
            text: '最終更新日',
            formatOptions: {
                dateStyle: 'short',
                timeStyle: 'medium'
            }
        },
        nav: [
            { text: "ビデオチュートリアル", link: "https://www.bilibili.com/video/BV1RGZ8YbEGh/" },
            { text: "tg", link: "https://tg.lingkuma.org/" },
            { text: "Discord", link: "https://dc.lingkuma.org/" },

            { text: "作者を支援する", link: "/ja/support" },
        ],
        sidebar: [

            {
                text: '紹介',
                items: [
                    { text: '紹介', link: '/ja/init/Lingkuma/Lingkuma' },
                    { text: '最新アップデート紹介', link: '/ja/init/new/new' },
                ]
            },

            {
                text: '入門必読',
                items: [
                    { text: 'スタートガイド', link: '/ja/intro/start/start' },
                    { text: '電子書籍', link: '/ja/intro/ebook/ebook' },
                    { text: 'ソフトウェア推奨', link: '/ja/intro/supportList/supportList' },


                ]
            },
            {
                text: '詳細な',
                items: [
                    {
                        text: 'マルチプラットフォーム', link: '/ja/more/platform/platform',

                    },
                    {
                        text: 'リアルタイム字幕', link: '/ja/more/WindowsCaptions/WindowsCaptions'

                    },


                ]
            },
            {
                text: 'お知らせ',
                items: [

                    { text: 'ログ詳細', link: '/ja/server/log/log' },

                    { text: 'サービス規約', link: '/ja/server/service' },
                    { text: 'プライバシーポリシー', link: '/ja/server/privacy' }
                ]
            }
        ]
    }
})