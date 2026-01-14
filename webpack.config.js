const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const glob = require('glob');
const TerserPlugin = require('terser-webpack-plugin');
const chart = require('./src/options/chars/chart');

// 获取service目录下的所有js文件
// const serviceFiles = glob.sync('./src/service/*.js');
// const pluginFiles = glob.sync('./src/plugin/**/*.js');
// const utilsFiles = glob.sync('./src/utils/*.js');
module.exports = {
  mode: 'production', // 或 'development'，取决于您的需求
  entry: {
    // 将content中的每个文件拆分为单独的入口点
    a0_afdian: "./src/service/a0_afdian.js",
    evaluateExpression: "./src/utils/evaluateExpression.js",
    pdfDetection: "./src/utils/pdfDetection.js",
    sentenseOoOo: "./src/utils/sentenseOoOo.js",
    liquidGlass: "./src/utils/liquid-glass.js",
    bionic: "./src/plugin/bionic.js",
    readingRuler: "./src/plugin/readingRuler.js",
    clipSubtitles: "./src/plugin/clipSubtitles.js",
    waifu: "./src/plugin/waifu/waifu.js",
    youtubeCaptionFix: "./src/plugin/youtubeCaptionFix.js",
    youtubeCaptionGet: "./src/plugin/youtubeCaptionGet.js",
    a1_loadKnowWords: "./src/service/a1_loadKnowWords.js",
    a2_hightlight: "./src/service/a2_hightlight.js",
    a3_aiFragen: "./src/service/a3_aiFragen.js",
    a4_tooltip_new: "./src/service/a4_tooltip_new.js",
    a5_custom_word_selection: "./src/service/a5_custom_word_selection.js",
    a6_custom_highlight: "./src/service/a6_custom_highlight.js",
    a7_words_boom: "./src/service/a7_words_boom.js",
    tts: "./src/plugin/tts.js",
    orion_tts: "./src/plugin/orion_tts.js",
    edge_tts: "./src/plugin/edge_tts.js", 
    content: "./src/content.js",
    // 其他入口保持不变
    background: './background.js',
    cloudAPI: './src/utils/cloudAPI.js',
    dataAccessLayer: './src/utils/dataAccessLayer.js',
    popup: './src/popup/popup.js',
    options: [
      './src/options/options.js'
    ],
    // webdav: [
    //   './src/options/webdav/webdav.js'
    // ],
    epubSplitter: './src/options/epubSplitter/epubSplitter.js',
    epubFormatter: './src/options/epubSplitter/epubFormatter.js',
    epubToTelegraph: './src/options/epubToTelegraph/epubToTelegraph.js',  
    offscreen: './src/player/offscreen.js',
    sidebar: './src/sidebar/sidebar.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: (pathData) => {
      // 为原始content入口中的文件保持原始目录结构
      // if(pathData.chunk.name === 'webdav'){
      //   return 'src/options/webdav/[name].js';
      // }

      if (pathData.chunk.name === 'a0_afdian') {
        return 'src/service/a0_afdian.js';
      }
      if (pathData.chunk.name === 'evaluateExpression') {
        return 'src/utils/evaluateExpression.js';
      }
      if (pathData.chunk.name === 'pdfDetection') {
        return 'src/utils/pdfDetection.js';
      }
      if (pathData.chunk.name === 'sentenseOoOo') {
        return 'src/utils/sentenseOoOo.js';
      }
      if (pathData.chunk.name === 'liquidGlass') {
        return 'src/utils/liquid-glass.js';
      }
      if (pathData.chunk.name === 'bionic') {
        return 'src/plugin/bionic.js';
      }
      if (pathData.chunk.name === 'readingRuler') {
        return 'src/plugin/readingRuler.js';
      }
      if (pathData.chunk.name === 'clipSubtitles') {
        return 'src/plugin/clipSubtitles.js';
      }
      if (pathData.chunk.name === 'waifu') {
        return 'src/plugin/waifu/waifu.js';
      }
      if (pathData.chunk.name === 'youtubeCaptionFix') {
        return 'src/plugin/youtubeCaptionFix.js';
      }
      if (pathData.chunk.name === 'youtubeCaptionGet') {
        return 'src/plugin/youtubeCaptionGet.js';
      }
      if (pathData.chunk.name === 'a1_loadKnowWords') {
        return 'src/service/a1_loadKnowWords.js';
      }
      if (pathData.chunk.name === 'a2_hightlight') {
        return 'src/service/a2_hightlight.js';
      }
      if (pathData.chunk.name === 'a3_aiFragen') {
        return 'src/service/a3_aiFragen.js';
      }
      if (pathData.chunk.name === 'a4_tooltip_new') {
        return 'src/service/a4_tooltip_new.js';
      }
      if (pathData.chunk.name === 'a5_custom_word_selection') {
        return 'src/service/a5_custom_word_selection.js';
      }
      if (pathData.chunk.name === 'a6_custom_highlight') {
        return 'src/service/a6_custom_highlight.js';
      } 
      if (pathData.chunk.name === 'a7_words_boom') {
        return 'src/service/a7_words_boom.js';
      }




      if (pathData.chunk.name === 'tts') {
        return 'src/plugin/tts.js';
      }
      if (pathData.chunk.name === 'orion_tts') {
        return 'src/plugin/orion_tts.js';
      }
      if (pathData.chunk.name === 'edge_tts') {
        return 'src/plugin/edge_tts.js';
      }
      

      // 以下是原有的条件判断
      if (pathData.chunk.name === 'epubSplitter') {
        return 'src/options/epubSplitter/[name].js';
      }
      if (pathData.chunk.name === 'epubFormatter') {
        return 'src/options/epubSplitter/[name].js';
      }
      if (pathData.chunk.name === 'epubToTelegraph') {
        return 'src/options/epubToTelegraph/[name].js';
      } 


      if(pathData.chunk.name === 'popup'){
        return 'src/popup/[name].js';
      }
      if(pathData.chunk.name === 'options'){
        return 'src/options/[name].js';
      }
      if(pathData.chunk.name === 'sidebar'){
        return 'src/sidebar/[name].js';
      }
      if(pathData.chunk.name === 'offscreen'){
        return 'src/player/offscreen.js';
      }
      if(pathData.chunk.name === 'content'){
        return 'src/content.js';
      }
      if(pathData.chunk.name === 'background'){
        return 'background.js';
      }
      if(pathData.chunk.name === 'cloudAPI'){
        return 'src/utils/cloudAPI.js';
      }
      if(pathData.chunk.name === 'dataAccessLayer'){
        return 'src/utils/dataAccessLayer.js';
      }

      // 其他文件保持原位置
      return '[name].js';
    },
    iife: false,        // 禁用立即执行函数表达式包装
    module: false,      // 禁用模块模式
  },
  optimization: {
    concatenateModules: false, // 禁用模块连接
    minimize: true,           // 改为true启用混淆
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false,   // 删除所有注释
            ascii_only: true,  // 将非ASCII字符(如中文、日文)转换为Unicode编码
          },
          compress: {
            drop_console: true, // 修改为true以删除所有console语句
          },
        },
        extractComments: false, // 不提取注释到单独文件
      }),
    ],
    runtimeChunk: false,      // 禁用运行时chunk
    moduleIds: 'named',       // 使用命名模块ID
    splitChunks: false,       // 禁用代码分割
    usedExports: false,       // 禁用未使用导出分析
    providedExports: false,   // 禁用提供导出分析
  },
  plugins: [
    new CleanWebpackPlugin(),

    // 复制静态文件
    new CopyPlugin({
      patterns: [

        //{ from: 'manifest-firefox.json', to: 'manifest.json' },
        //{ from: 'manifest-firefox-local.json', to: 'manifest.json' },
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'content.css', to: '' },
        { from: 'src/options/epubSplitter/jszip.min.js', to: 'src/options/epubSplitter/jszip.min.js',info: { minimized: true }}, // 告诉webpack这已经是压缩文件，不要处理
        { from: 'src/options/epubSplitter/FileSaver.min.js', to: 'src/options/epubSplitter/FileSaver.min.js',info: { minimized: true } },// 告诉webpack这已经是压缩文件，不要处理
        { from: 'src/icons/**/*', to: 'src/icons/[name][ext]' ,info: { minimized: true }},
        { from: 'src/popup/img/**/*', to: 'src/popup/img/[name][ext]' ,info: { minimized: true }},
        { from: 'src/options/images/**/*', to: 'src/options/images/[name][ext]' ,info: { minimized: true }},
        { from: 'src/service/jp/dict/', to: 'src/service/jp/dict/' ,info: { minimized: true }},
        { from: 'src/service/jp/kuromoji.js', to: 'src/service/jp/kuromoji.js' ,info: { minimized: true }},
        { from: 'src/options/webdav/webdav.js', to: 'src/options/webdav/webdav.js' ,info: { minimized: true }},
        { from: 'src/service/image/*', to: 'src/service/image/[name][ext]',info: { minimized: true }},
        { from: 'src/service/image/tg/*.svg', to: 'src/service/image/tg/[name][ext]',info: { minimized: true }},
        { from: 'src/service/image/tg_png/*.jpg', to: 'src/service/image/tg_png/[name][ext]',info: { minimized: true }},
        { from: 'src/fonts/*', to: 'src/fonts/[name][ext]',info: { minimized: true }},
        { from: 'src/options/chars/chart.js', to: 'src/options/chars/chart.js' ,info: { minimized: true }},
        { from: 'src/options/chars/chartjs-adapter-date-fns.js', to: 'src/options/chars/chartjs-adapter-date-fns.js' ,info: { minimized: true }},
        { from: 'src/service/videos/kawai.mp4', to: 'src/service/videos/kawai.mp4' ,info: { minimized: true }},
        { from: 'src/plugin/youtubeCaptionInjected.js', to: 'src/plugin/youtubeCaptionInjected.js' ,info: { minimized: true }},
        { from: 'src/options/liquid-group/**/*', to: 'src/options/liquid-group/[name][ext]' ,info: { minimized: true }},
        { from: 'src/service/image/lottie/*.tgs', to: 'src/service/image/lottie/[name][ext]',info: { minimized: true }},
        { from: 'src/service/image/lottie/tgs-balloon.html', to: 'src/service/image/lottie/tgs-balloon.html',info: { minimized: true }},
        { from: 'src/service/image/lottie/tgs-balloon.js', to: 'src/service/image/lottie/tgs-balloon.js',info: { minimized: true }},
        { from: 'src/utils/tgs-player.min.js', to: 'src/utils/tgs-player.min.js',info: { minimized: true }},
        { from: '_locales', to: '_locales', noErrorOnMissing: true },
        { from: 'src/utils/lingqBlocker.js', to: 'src/utils/lingqBlocker.js' ,info: { minimized: true }},
        { from: 'src/plugin/youtubeVideoOverlay.js', to: 'src/plugin/youtubeVideoOverlay.js' ,info: { minimized: true }},
        
        // { from: 'src/options/options.js', to: 'src/options/options.js' ,info: { minimized: true }},
        // 添加其他需要复制的资源
      ],
    }),

    // 生成HTML文件
    new HtmlWebpackPlugin({
      template: './src/popup/popup.html',
      filename: 'src/popup/popup.html',
      chunks: ['popup'],
    }),
    new HtmlWebpackPlugin({
      template: './src/options/options.html',
      filename: 'src/options/options.html',
      chunks: ['options'],
    }),
    new HtmlWebpackPlugin({
      template: './src/options/epubSplitter/epubSplitter.html',
      filename: 'src/options/epubSplitter/epubSplitter.html',
      chunks: ['epubSplitter'],
      inject: false,
    }),
    new HtmlWebpackPlugin({
      template: './src/options/epubToTelegraph/epubToTelegraph.html',
      filename: 'src/options/epubToTelegraph/epubToTelegraph.html',
      chunks: ['epubToTelegraph'],
      inject: false,
    }),
    new HtmlWebpackPlugin({
      template: './src/player/offscreen.html',
      filename: 'src/player/offscreen.html',
      chunks: ['offscreen'],
      inject: false,
    }),
    new HtmlWebpackPlugin({
      template: './src/sidebar/sidebar.html',
      filename: 'src/sidebar/sidebar.html',
      chunks: ['sidebar'],
      inject: false,
    }),
  ],
  resolve: {
    extensions: ['.js'],
    modules: [path.resolve(__dirname, 'src'), 'node_modules']
  },
  module: {
    rules: []  // 移除所有规则
  }
};