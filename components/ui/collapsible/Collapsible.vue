<script setup lang="ts">
import { CollapsibleRoot } from 'reka-ui';

const props = defineProps<{
  open?: boolean;
  defaultOpen?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();
</script>

<template>
  <CollapsibleRoot v-bind="props" @update:open="emit('update:open', $event)">
    <slot />
  </CollapsibleRoot>
</template>
