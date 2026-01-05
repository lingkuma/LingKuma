// 检查 URL 是否匹配 PDF 网址白名单
const pdfUrls = [
  "https://mozilla.github.io/pdf.js/web/viewer.html",
  "https://web.koodoreader.com/"
];


function isPdfViewer() {
  try {
    // 尝试安全地获取顶层窗口的URL
    const currentUrl = window.top.location.href;
    // 如果 URL 以 PDF.js viewer 开头，认为是 PDF 页面
    if (currentUrl.indexOf(pdfUrls[0]) === 0) {
      return true;
    }
    // 对于 koodoreader：只有当 URL 以该域名开头并且哈希部分以 "#/pdf" 开头时视为 PDF 页面
    if (currentUrl.indexOf(pdfUrls[1]) === 0 && window.top.location.hash.startsWith("#/pdf")) {
      return true;
    }
    return false;
  } catch (error) {
    // 捕获跨域错误，在控制台输出信息并返回false
    console.log("无法访问顶层窗口URL（可能是跨域iframe）:", error.message);
    return false;
  }
}

let isPdf = isPdfViewer();

// 将 isPdf 变量导出到全局作用域，使其他文件可以访问
window.isPdf = isPdf;


// 使用已经计算好的 isPdf 变量，避免再次调用 isPdfViewer() 可能导致的跨域错误
if (isPdf) {
  console.log("当前页面是PDF页面");
  // 给根元素添加 pdf-viewer 类，供 CSS 判断使用
  document.documentElement.classList.add("pdf-viewer");
} else {
  console.log("当前页面不是PDF页面");
}