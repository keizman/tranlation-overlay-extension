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

    <!-- Paragraph TTS Collapsible -->
    <Collapsible v-model:open="paragraphTTSOpen" class="space-y-2">
      <Card>
        <CardHeader class="py-4">
          <CollapsibleTrigger class="w-full">
            <div class="flex items-center justify-between cursor-pointer">
              <div class="flex items-center gap-3">
                <div
                  class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"
                >
                  <TextSelect
                    class="h-4 w-4 text-blue-600 dark:text-blue-400"
                  />
                </div>
                <div class="text-left">
                  <h3 class="text-base font-semibold text-foreground">
                    {{ $t('listenSettings.paragraphTTS.title') }}
                  </h3>
                  <p class="text-sm text-muted-foreground">
                    {{ $t('listenSettings.paragraphTTS.description') }}
                  </p>
                </div>
              </div>
              <ChevronDown
                class="h-5 w-5 text-muted-foreground transition-transform duration-200"
                :class="{ 'rotate-180': paragraphTTSOpen }"
              />
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent class="pt-0 border-t">
            <div class="space-y-6 pt-6">
              <!-- Enable Switch -->
              <div
                class="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50"
              >
                <div class="flex items-center gap-3">
                  <div class="space-y-0.5">
                    <Label class="text-base font-semibold">
                      {{ $t('listenSettings.paragraphTTS.enable') }}
                    </Label>
                    <p class="text-sm text-muted-foreground">
                      {{ $t('listenSettings.paragraphTTS.enableDescription') }}
                    </p>
                  </div>
                </div>
                <Switch
                  :model-value="settings.paragraphTTS?.enabled ?? true"
                  @update:model-value="handleParagraphTTSChange"
                />
              </div>

              <!-- Info Box -->
              <div
                v-if="settings.paragraphTTS?.enabled"
                class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
              >
                <div class="flex items-start gap-3">
                  <Info
                    class="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5"
                  />
                  <div class="text-sm text-blue-800 dark:text-blue-200">
                    <p class="font-medium mb-1">
                      {{ $t('listenSettings.paragraphTTS.tipTitle') }}
                    </p>
                    <p class="text-blue-700 dark:text-blue-300">
                      {{ $t('listenSettings.paragraphTTS.tipContent') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

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
import { ref, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Headphones,
  Volume2,
  ChevronDown,
  TextSelect,
  Info,
} from 'lucide-vue-next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { browser } from 'wxt/browser';
import type { UserSettings } from '@/src/modules/shared/types/storage';
import { DEFAULT_SETTINGS } from '@/src/modules/shared/constants/defaults';
import { StorageService } from '@/src/modules/core/storage';
import TTSSettings from '../tts/TTSSettings.vue';

const { t } = useI18n();
const ttsOpen = ref(true);
const paragraphTTSOpen = ref(true);

const emit = defineEmits<{
  saveMessage: [message: string];
}>();

// Settings data
const settings = ref<UserSettings>({ ...DEFAULT_SETTINGS });
const storageService = StorageService.getInstance();

// Load settings
onMounted(async () => {
  const loadedSettings = await storageService.getUserSettings();

  // Migration: if no paragraphTTS config, use default
  if (!loadedSettings.paragraphTTS) {
    console.log(
      '[ListenSettings] Migrating paragraphTTS settings with defaults',
    );
    loadedSettings.paragraphTTS = { enabled: true };
    await storageService.saveUserSettings(loadedSettings);
  }

  settings.value = loadedSettings;
});

// Handle paragraph TTS toggle
const handleParagraphTTSChange = (enabled: boolean) => {
  if (!settings.value.paragraphTTS) {
    settings.value.paragraphTTS = { enabled };
  } else {
    settings.value.paragraphTTS.enabled = enabled;
  }
};

// Watch for settings changes and save
watch(
  settings,
  async (newSettings) => {
    await storageService.saveUserSettings(newSettings);
    console.log('[ListenSettings] Settings saved:', newSettings.paragraphTTS);
    emit('saveMessage', t('settings.save'));

    // Notify other components that settings have been updated
    browser.runtime.sendMessage({
      type: 'settings_updated',
      settings: newSettings,
    });
  },
  { deep: true },
);

const handleSaveMessage = (message: string) => {
  emit('saveMessage', message);
};
</script>
