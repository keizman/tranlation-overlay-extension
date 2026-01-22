<template>
  <div class="space-y-6">
    <!-- Header Card -->
    <Card>
      <CardHeader>
        <CardTitle>
          <div class="flex items-center gap-3">
            <div
              class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"
            >
              <BookOpen class="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 class="text-2xl font-bold text-foreground">
                {{ $t('readSettings.title') }}
              </h2>
              <p class="text-sm text-muted-foreground font-normal">
                {{ $t('readSettings.description') }}
              </p>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
    </Card>

    <!-- Word Card Settings Collapsible -->
    <Collapsible v-model:open="wordCardOpen" class="space-y-2">
      <Card>
        <CardHeader class="py-4">
          <CollapsibleTrigger class="w-full">
            <div class="flex items-center justify-between cursor-pointer">
              <div class="flex items-center gap-3">
                <div
                  class="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center"
                >
                  <Book class="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div class="text-left">
                  <h3 class="text-base font-semibold text-foreground">
                    {{ $t('readSettings.wordCard.title') }}
                  </h3>
                  <p class="text-sm text-muted-foreground">
                    {{ $t('readSettings.wordCard.enableDescription') }}
                  </p>
                </div>
              </div>
              <ChevronDown
                class="h-5 w-5 text-muted-foreground transition-transform duration-200"
                :class="{ 'rotate-180': wordCardOpen }"
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
                      {{ $t('readSettings.wordCard.enable') }}
                    </Label>
                    <p class="text-sm text-muted-foreground">
                      {{ $t('readSettings.wordCard.enableDescription') }}
                    </p>
                  </div>
                </div>
                <Switch
                  :model-value="settings.wordCard.enabled"
                  @update:model-value="handleEnableChange"
                />
              </div>

              <!-- Sub Settings -->
              <div
                v-if="settings.wordCard.enabled"
                class="space-y-4 pl-4 border-l-2 border-muted"
              >
                <!-- Auto Speak -->
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label>{{ $t('readSettings.wordCard.autoSpeak') }}</Label>
                    <p class="text-xs text-muted-foreground">
                      {{ $t('readSettings.wordCard.autoSpeakHint') }}
                    </p>
                  </div>
                  <Switch
                    :model-value="settings.wordCard.autoSpeak"
                    @update:model-value="settings.wordCard.autoSpeak = $event"
                  />
                </div>

                <!-- Show English Definition (Hidden, defaults to true/follows word card) -->
                <!-- <div class="flex items-center justify-between"> ... </div> -->
              </div>

              <!-- Functional Description (Green Box) -->
              <div
                v-if="settings.wordCard.enabled"
                class="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
              >
                <div class="flex items-start gap-3">
                  <CheckCircle
                    class="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5"
                  />
                  <div class="text-sm text-green-800 dark:text-green-200">
                    <p class="font-medium mb-1">{{ $t('common.tip') }}</p>
                    <ul
                      class="list-disc list-inside space-y-1 text-green-700 dark:text-green-300"
                    >
                      <li>{{ $t('readSettings.wordCard.selectCapture') }}</li>
                      <li>
                        {{ $t('readSettings.wordCard.doubleClickCapture') }}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Gesture Translation Settings -->
    <Collapsible v-model:open="isOpenGestureTranslation" class="space-y-2">
      <Card>
        <CardHeader class="py-4">
          <CollapsibleTrigger class="w-full">
            <div class="flex items-center justify-between cursor-pointer">
              <div class="flex items-center gap-3">
                <div
                  class="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center"
                >
                  <Repeat
                    class="h-4 w-4 text-purple-600 dark:text-purple-400"
                  />
                </div>
                <div class="text-left">
                  <h3 class="text-base font-semibold text-foreground">
                    行监控 (Row Monitoring)
                  </h3>
                  <p class="text-sm text-muted-foreground">滑动段落进行翻译</p>
                </div>
              </div>
              <ChevronDown
                class="h-5 w-5 text-muted-foreground transition-transform duration-200"
                :class="{ 'rotate-180': isOpenGestureTranslation }"
              />
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent class="pt-0 border-t">
            <div class="space-y-6 pt-6">
              <!-- Left Swipe (Translate) -->
              <div
                class="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50"
              >
                <div class="flex items-center gap-3">
                  <div class="space-y-0.5">
                    <Label class="text-base font-semibold">
                      左滑翻译 (Left Swipe)
                    </Label>
                    <p class="text-sm text-muted-foreground">
                      左滑显示/隐藏翻译
                    </p>
                  </div>
                </div>
                <!-- Need to ensure settings structure matches default if not yet migrated. Default has gestureTranslation object -->
                <Switch
                  v-model:checked="settings.gestureTranslation.leftSwipe"
                />
              </div>

              <!-- Right Swipe (Hide) -->
              <div
                class="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50"
              >
                <div class="flex items-center gap-3">
                  <div class="space-y-0.5">
                    <Label class="text-base font-semibold">
                      右滑隐藏 (Right Swipe)
                    </Label>
                    <p class="text-sm text-muted-foreground">
                      右滑快速隐藏翻译内容
                    </p>
                  </div>
                </div>
                <Switch
                  v-model:checked="settings.gestureTranslation.rightSwipe"
                />
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import {
  BookOpen,
  Book,
  ChevronDown,
  CheckCircle,
  Repeat,
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
import {
  DEFAULT_SETTINGS,
  DEFAULT_WORD_CARD_CONFIG,
} from '@/src/modules/shared/constants/defaults';
import { StorageService } from '@/src/modules/core/storage';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const wordCardOpen = ref(true);
const isOpenGestureTranslation = ref(true);

const emit = defineEmits<{
  saveMessage: [message: string];
}>();

// 设置数据
const settings = ref<UserSettings>({ ...DEFAULT_SETTINGS });
const storageService = StorageService.getInstance();

// 加载设置
onMounted(async () => {
  const loadedSettings = await storageService.getUserSettings();

  // 迁移：如果没有词典卡片配置，使用默认值
  if (!loadedSettings.wordCard) {
    console.log('[ReadSettings] Migrating word card settings with defaults');
    loadedSettings.wordCard = { ...DEFAULT_WORD_CARD_CONFIG };
    await storageService.saveUserSettings(loadedSettings);
  }

  settings.value = loadedSettings;
});

// 处理主开关
const handleEnableChange = (enabled: boolean) => {
  settings.value.wordCard.enabled = enabled;
  if (enabled) {
    // 启用时确保有默认值
    if (!settings.value.wordCard.selectCaptureMode) {
      settings.value.wordCard = { ...DEFAULT_WORD_CARD_CONFIG, enabled: true };
    }
  }
};

// 统一监听保存
watch(
  settings,
  async (newSettings) => {
    await storageService.saveUserSettings(newSettings);
    console.log('[ReadSettings] Settings saved:', newSettings.wordCard);
    emit('saveMessage', t('settings.save'));

    // 通知其他组件设置已更新
    browser.runtime.sendMessage({
      type: 'settings_updated',
      settings: newSettings,
    });
  },
  { deep: true },
);
</script>
