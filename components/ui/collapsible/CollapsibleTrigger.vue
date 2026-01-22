<script setup lang="ts">
import { CollapsibleTrigger } from 'reka-ui';
</script>

<template>
  <CollapsibleTrigger v-bind="$attrs">
    <slot />
  </CollapsibleTrigger>
</template>
