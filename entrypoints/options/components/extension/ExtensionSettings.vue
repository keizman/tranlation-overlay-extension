<template>
  <div class="space-y-6">
    <!-- Extension Header -->
    <Card>
      <CardHeader>
        <CardTitle>
          <div class="flex items-center gap-3">
            <div
              class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"
            >
              <Puzzle class="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 class="text-2xl font-bold text-foreground">
                {{ $t('extensionSettings.title') }}
              </h2>
              <p class="text-sm text-muted-foreground font-normal">
                {{ $t('extensionSettings.description') }}
              </p>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
    </Card>

    <!-- Translation Service Collapsible -->
    <Collapsible v-model:open="translationOpen" class="space-y-2">
      <Card>
        <CardHeader class="py-4">
          <CollapsibleTrigger class="w-full">
            <div class="flex items-center justify-between cursor-pointer">
              <div class="flex items-center gap-3">
                <div
                  class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"
                >
                  <Languages class="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div class="text-left">
                  <h3 class="text-base font-semibold text-foreground">
                    {{ $t('extensionSettings.translationService.title') }}
                  </h3>
                  <p class="text-sm text-muted-foreground">
                    {{ $t('extensionSettings.translationService.description') }}
                  </p>
                </div>
              </div>
              <ChevronDown
                class="h-5 w-5 text-muted-foreground transition-transform duration-200"
                :class="{ 'rotate-180': translationOpen }"
              />
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent class="pt-0 border-t">
            <div class="pt-4">
              <TranslationSettings @save-message="handleSaveMessage" />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Puzzle, Languages, ChevronDown } from 'lucide-vue-next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import TranslationSettings from '../translation/TranslationSettings.vue';

const translationOpen = ref(true);

const emit = defineEmits<{
  saveMessage: [message: string];
}>();

const handleSaveMessage = (message: string) => {
  emit('saveMessage', message);
};
</script>
