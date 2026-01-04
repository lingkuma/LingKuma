import DefaultTheme from 'vitepress/theme';
import { useRouter } from 'vitepress'
import { watch, h, onMounted, App } from "vue"
import './style.css';
import './components/download.css'
import { enhanceAppWithTabs } from 'vitepress-plugin-tabs/client'
import {
  NolebaseEnhancedReadabilitiesMenu,
  NolebaseEnhancedReadabilitiesScreenMenu,
  InjectionKey,
  SpotlightStyle
} from '@nolebase/vitepress-plugin-enhanced-readabilities/client'
import type { Options } from '@nolebase/vitepress-plugin-enhanced-readabilities/client'
import '@nolebase/vitepress-plugin-enhanced-readabilities/client/style.css'
import giscus from './giscus.vue'
import notfound from './notfound.vue';
import DownloadLink from './components/DownloadLink.vue' // 路径根据你的结构调整
import downloadbtn from './downloadbtn.vue' // 路径根据你的结构调整
import ImageGallery from './components/ImageGallery.vue'
export default {
    ...DefaultTheme,
    Layout() {
        return h(DefaultTheme.Layout, null, {
            'not-found': () => h(notfound),
            // 'doc-after': () => h(giscus)
            'nav-bar-content-after': () => h(NolebaseEnhancedReadabilitiesMenu),
            'nav-screen-content-after': () => h(NolebaseEnhancedReadabilitiesScreenMenu),
        })
    },
    enhanceApp({ app }: { app: App }) {
        enhanceAppWithTabs(app)
        app.component('DownloadLink', DownloadLink)
        app.component('downloadbtn', downloadbtn)
        app.component('ImageGallery', ImageGallery)

        // 配置阅读增强插件
        app.provide(InjectionKey, {
            spotlight: {
                defaultToggle: true, // 默认开启 spotlight
                defaultStyle: SpotlightStyle.Aside // 默认使用 Aside 高亮样式
            }
        } as Options)
    },
    setup() {
        const handleRouteChange = () => {
            document.querySelectorAll('.downloadlink').forEach((e) => {
                (e as HTMLAnchorElement).target = '_blank'
                e.addEventListener('click', () => {

                    function checkIfMobile() {
                        const userAgent = navigator.userAgent || (navigator as any).vendor || (window as any).opera;
                        return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
                    }
                    if (checkIfMobile()) return;
                    setTimeout(() => {
                        window.location.href = `/${window.localStorage.currentlang}/support.html`;
                    }, 50);
                });
            })
            if (!window.location.hostname.startsWith('docs')) return;
            ['', 'image.'].forEach(
                (pre) => {
                    let replacetarget = window.location.protocol + '//' + pre + window.location.hostname.substring(5);
                    let origin = 'https://' + pre + 'lunatranslator.org'
                    let srcs = document.querySelectorAll(pre ? "img" : 'a');
                    srcs.forEach(
                        (e) => {
                            let att = pre ? 'src' : 'href';
                            let attrValue = e.getAttribute(att);
                            if (!attrValue) return;
                            let tgt = attrValue.replace(origin, replacetarget)
                            if (tgt != attrValue) {
                                e.setAttribute(att, tgt)
                            }
                        }
                    )
                }
            )
        }
        const supportlangs = ['zh', 'en', 'ja', 'cht']
        onMounted(
            () => {
                let _ = window.location.pathname.split('/')[1]
                if (supportlangs.includes(_))
                    window.localStorage.currentlang = _
                handleRouteChange()
            }
        )
        const router = useRouter();
        watch(
            () => router.route.path,
            (path) => {
                let _ = path.split('/')[1]
                if (supportlangs.includes(_))
                    window.localStorage.currentlang = _
            }
        )
        router.onAfterRouteChange = () => {
            handleRouteChange()
        };
    }
}