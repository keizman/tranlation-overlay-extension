<script setup lang="ts">
import { CollapsibleContent } from 'reka-ui';
</script>

<template>
  <CollapsibleContent v-bind="$attrs">
    <slot />
  </CollapsibleContent>
</template>
