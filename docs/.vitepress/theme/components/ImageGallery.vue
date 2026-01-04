<template>
  <div class="image-gallery">
    <button class="nav-button prev" @click="scrollLeft" :disabled="isAtStart">
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
      </svg>
    </button>
    
    <div class="gallery-container" ref="container">
      <div class="gallery-track">
        <div 
          v-for="(image, index) in images" 
          :key="index" 
          class="gallery-item"
          :style="{ width: itemWidth }"
        >
          <img :src="image.src" :alt="image.alt || `Image ${index + 1}`" />
          <div v-if="image.caption" class="image-caption">{{ image.caption }}</div>
        </div>
      </div>
    </div>
    
    <button class="nav-button next" @click="scrollRight" :disabled="isAtEnd">
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';

interface ImageItem {
  src: string;
  alt?: string;
  caption?: string;
}

const props = defineProps({
  images: {
    type: Array as () => ImageItem[],
    required: true,
    default: () => []
  },
  itemWidth: {
    type: String,
    default: '300px'
  },
  gap: {
    type: String,
    default: '20px'
  }
});

const container = ref(null);
const currentScroll = ref(0);
const maxScroll = ref(0);

const isAtStart = computed(() => currentScroll.value <= 0);
const isAtEnd = computed(() => {
  if (maxScroll.value <= 0) return false;
  return currentScroll.value >= maxScroll.value - 1;
});

const updateMaxScroll = () => {
  if (container.value) {
    maxScroll.value = container.value.scrollWidth - container.value.clientWidth;
  }
};

const scrollLeft = () => {
  if (container.value) {
    const scrollAmount = container.value.clientWidth * 0.8;
    container.value.scrollBy({
      left: -scrollAmount,
      behavior: 'smooth'
    });
  }
};

const scrollRight = () => {
  if (container.value) {
    const scrollAmount = container.value.clientWidth * 0.8;
    const targetScroll = currentScroll.value + scrollAmount;
    const actualScroll = Math.min(targetScroll, maxScroll.value);
    
    container.value.scrollTo({
      left: actualScroll,
      behavior: 'smooth'
    });
  }
};

const handleScroll = () => {
  if (container.value) {
    currentScroll.value = container.value.scrollLeft;
  }
};

onMounted(() => {
  if (container.value) {
    container.value.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', updateMaxScroll);
    setTimeout(() => {
      updateMaxScroll();
      currentScroll.value = container.value.scrollLeft;
    }, 100);
  }
});

onUnmounted(() => {
  if (container.value) {
    container.value.removeEventListener('scroll', handleScroll);
    window.removeEventListener('resize', updateMaxScroll);
  }
});
</script>

<style scoped>
.image-gallery {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 20px 0;
}

.gallery-container {
  flex: 1;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 10px 0;
}

.gallery-container::-webkit-scrollbar {
  display: none;
}

.gallery-track {
  display: flex;
  gap: v-bind('props.gap');
}

.gallery-item {
  flex-shrink: 0;
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.gallery-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.gallery-item img {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
}

.image-caption {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: white;
  padding: 20px 10px 10px;
  font-size: 14px;
  text-align: center;
}

.nav-button {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  color: var(--vp-c-text-1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.nav-button:hover:not(:disabled) {
  background-color: var(--vp-c-brand-1);
  color: white;
  border-color: var(--vp-c-brand-1);
}

.nav-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-button.prev {
  left: -20px;
}

.nav-button.next {
  right: -20px;
}

@media (max-width: 768px) {
  .nav-button.prev {
    left: 5px;
  }
  
  .nav-button.next {
    right: 5px;
  }
  
  .gallery-item {
    width: 250px !important;
  }
}
</style>
