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
          @click="openLightbox(index)"
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

    <div v-if="isLightboxOpen" class="lightbox" @click.self="closeLightbox">
      <button class="lightbox-close" @click="closeLightbox">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
      
      <button class="lightbox-nav prev" @click="prevImage" :disabled="currentImageIndex === 0">
        <svg viewBox="0 0 24 24" width="48" height="48">
          <path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
        </svg>
      </button>
      
      <div class="lightbox-content">
        <img :src="images[currentImageIndex].src" :alt="images[currentImageIndex].alt || `Image ${currentImageIndex + 1}`" />
        <div v-if="images[currentImageIndex].caption" class="lightbox-caption">
          {{ images[currentImageIndex].caption }}
        </div>
        <div class="lightbox-counter">
          {{ currentImageIndex + 1 }} / {{ images.length }}
        </div>
      </div>
      
      <button class="lightbox-nav next" @click="nextImage" :disabled="currentImageIndex === images.length - 1">
        <svg viewBox="0 0 24 24" width="48" height="48">
          <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
        </svg>
      </button>
    </div>
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
const maxScroll = ref(-1);

const isLightboxOpen = ref(false);
const currentImageIndex = ref(0);

const isAtStart = computed(() => currentScroll.value <= 0);
const isAtEnd = computed(() => maxScroll.value >= 0 && currentScroll.value >= maxScroll.value - 1);

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
    container.value.scrollBy({
      left: scrollAmount,
      behavior: 'smooth'
    });
  }
};

const handleScroll = () => {
  if (container.value) {
    currentScroll.value = container.value.scrollLeft;
  }
};

const openLightbox = (index: number) => {
  currentImageIndex.value = index;
  isLightboxOpen.value = true;
  document.body.style.overflow = 'hidden';
};

const closeLightbox = () => {
  isLightboxOpen.value = false;
  document.body.style.overflow = '';
};

const prevImage = () => {
  if (currentImageIndex.value > 0) {
    currentImageIndex.value--;
  }
};

const nextImage = () => {
  if (currentImageIndex.value < props.images.length - 1) {
    currentImageIndex.value++;
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (!isLightboxOpen.value) return;
  
  switch (e.key) {
    case 'ArrowLeft':
      prevImage();
      break;
    case 'ArrowRight':
      nextImage();
      break;
    case 'Escape':
      closeLightbox();
      break;
  }
};

const waitForImagesToLoad = () => {
  return new Promise<void>((resolve) => {
    if (!container.value) {
      resolve();
      return;
    }

    const images = container.value.querySelectorAll('img');
    if (images.length === 0) {
      resolve();
      return;
    }

    let loadedCount = 0;
    const totalImages = images.length;

    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount === totalImages) {
        resolve();
      }
    };

    images.forEach((img) => {
      if (img.complete) {
        checkAllLoaded();
      } else {
        img.addEventListener('load', checkAllLoaded);
        img.addEventListener('error', checkAllLoaded);
      }
    });
  });
};

onMounted(() => {
  if (container.value) {
    container.value.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', updateMaxScroll);
    window.addEventListener('keydown', handleKeydown);
    
    waitForImagesToLoad().then(() => {
      updateMaxScroll();
      currentScroll.value = container.value.scrollLeft;
    });
  }
});

onUnmounted(() => {
  if (container.value) {
    container.value.removeEventListener('scroll', handleScroll);
    window.removeEventListener('resize', updateMaxScroll);
    window.removeEventListener('keydown', handleKeydown);
    document.body.style.overflow = '';
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
  cursor: pointer;
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

.lightbox {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.lightbox-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  z-index: 1001;
}

.lightbox-close:hover {
  background-color: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
}

.lightbox-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  z-index: 1001;
}

.lightbox-nav:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
}

.lightbox-nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.lightbox-nav.prev {
  left: 20px;
}

.lightbox-nav.next {
  right: 20px;
}

.lightbox-content {
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.lightbox-content img {
  max-width: 100%;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.lightbox-caption {
  color: white;
  font-size: 16px;
  margin-top: 16px;
  text-align: center;
  max-width: 800px;
  line-height: 1.5;
}

.lightbox-counter {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  color: white;
  font-size: 14px;
  background-color: rgba(0, 0, 0, 0.5);
  padding: 8px 16px;
  border-radius: 20px;
  z-index: 1001;
}

@media (max-width: 768px) {
  .lightbox-nav {
    width: 50px;
    height: 50px;
  }
  
  .lightbox-nav.prev {
    left: 10px;
  }
  
  .lightbox-nav.next {
    right: 10px;
  }
  
  .lightbox-close {
    width: 36px;
    height: 36px;
    top: 10px;
    right: 10px;
  }
  
  .lightbox-caption {
    font-size: 14px;
    padding: 0 20px;
  }
}
</style>
