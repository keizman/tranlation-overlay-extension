<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';
import { computed } from 'vue';

interface Props {
  src?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg';
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  fallback: '',
});

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

const initials = computed(() => {
  if (!props.fallback) return '?';
  return props.fallback
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
});
</script>

<template>
  <div
    data-slot="avatar"
    :class="
      cn(
        'relative inline-flex items-center justify-center rounded-full bg-muted overflow-hidden select-none',
        sizeClasses[size],
        props.class,
      )
    "
  >
    <img
      v-if="src"
      :src="src"
      :alt="fallback"
      class="h-full w-full object-cover"
    />
    <span v-else class="font-medium text-muted-foreground">
      {{ initials }}
    </span>
  </div>
</template>
