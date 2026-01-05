// 滚轮滚动玻璃条功能 - 跟手细腻滚动
document.addEventListener('DOMContentLoaded', function() {
  const glassList = document.getElementById('glass-list');

  if (glassList) {
    let targetScroll = glassList.scrollLeft;
    let currentScroll = glassList.scrollLeft;
    let isAnimating = false;

    glassList.addEventListener('wheel', function(e) {
      e.preventDefault();

      // 归一化滚轮数据
      let delta = e.deltaY;

      if (e.deltaMode === 1) {
        delta *= 40;
      } else if (e.deltaMode === 2) {
        delta *= glassList.clientHeight;
      }

      // 更新目标位置(完全跟手)
      targetScroll += delta;

      // 限制范围
      const maxScroll = glassList.scrollWidth - glassList.clientWidth;
      targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));

      // 启动平滑动画
      if (!isAnimating) {
        isAnimating = true;
        animate();
      }
    }, { passive: false });

    function animate() {
      const diff = targetScroll - currentScroll;

      if (Math.abs(diff) > 0.1) {
        // 快速跟随,保持跟手感(0.3系数,越大越跟手)
        currentScroll += diff * 0.1;
        glassList.scrollLeft = currentScroll;

        // 继续动画
        requestAnimationFrame(animate);
      } else {
        // 到达目标,停止动画
        currentScroll = targetScroll;
        glassList.scrollLeft = currentScroll;
        isAnimating = false;
      }
    }
  }
});
