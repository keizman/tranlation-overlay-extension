<template>
  <div class="space-y-6">
    <!-- Listen Header -->
    <Card>
      <CardHeader>
        <CardTitle>
          <div class="flex items-center gap-3">
            <div
              class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"
            >
              <Headphones class="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 class="text-2xl font-bold text-foreground">
                {{ $t('listenSettings.title') }}
              </h2>
              <p class="text-sm text-muted-foreground font-normal">
                {{ $t('listenSettings.description') }}
              </p>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
    </Card>

    <!-- TTS Service Collapsible -->
    <Collapsible v-model:open="ttsOpen" class="space-y-2">
      <Card>
        <CardHeader class="py-4">
          <CollapsibleTrigger class="w-full">
            <div class="flex items-center justify-between cursor-pointer">
              <div class="flex items-center gap-3">
                <div
                  class="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"
                >
                  <Volume2 class="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div class="text-left">
                  <h3 class="text-base font-semibold text-foreground">
                    {{ $t('listenSettings.ttsService.title') }}
                  </h3>
                  <p class="text-sm text-muted-foreground">
                    {{ $t('listenSettings.ttsService.description') }}
                  </p>
                </div>
              </div>
              <ChevronDown
                class="h-5 w-5 text-muted-foreground transition-transform duration-200"
                :class="{ 'rotate-180': ttsOpen }"
              />
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent class="pt-0 border-t">
            <div class="pt-4">
              <TTSSettings @save-message="handleSaveMessage" />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Headphones, Volume2, ChevronDown } from 'lucide-vue-next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import TTSSettings from '../tts/TTSSettings.vue';

const ttsOpen = ref(true);

const emit = defineEmits<{
  saveMessage: [message: string];
}>();

const handleSaveMessage = (message: string) => {
  emit('saveMessage', message);
};
</script>
