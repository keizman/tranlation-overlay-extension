<template>
  <div class="space-y-6">
    <!-- TTS 底栏开关 -->
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 class="text-2xl font-bold text-foreground">
            {{ $t('ttsSettings.title') }}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- 全文TTS底栏开关 -->
        <div class="bg-muted/50 rounded-lg p-4 border border-border/50">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div
                class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"
              >
                <Volume2 class="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 class="text-base font-semibold text-foreground">
                  {{ $t('ttsSettings.barToggle.title') }}
                </h3>
                <p class="text-sm text-muted-foreground">
                  {{ $t('ttsSettings.barToggle.description') }}
                </p>
              </div>
            </div>
            <Switch
              :checked="settings.enableFullTextTTSBar"
              @update:checked="toggleTTSBar"
            />
          </div>
        </div>

        <!-- TTS 配置入口 -->
        <div class="bg-muted/50 rounded-lg p-4 border border-border/50">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div
                class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"
              >
                <Settings2 class="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 class="text-base font-semibold text-foreground">
                  {{ $t('ttsSettings.apiConfig.title') }}
                </h3>
                <p class="text-sm text-muted-foreground">
                  {{ $t('ttsSettings.apiConfig.description') }}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              @click="showConfigManager = true"
            >
              <Settings class="h-4 w-4 mr-1" />
              {{ $t('ttsSettings.apiConfig.manage') }}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 当前配置状态 -->
    <Card v-if="activeConfig">
      <CardHeader class="pb-3">
        <CardTitle>
          <h2 class="text-2xl font-bold text-foreground">
            {{ $t('ttsSettings.currentConfig.title') }}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="p-3 bg-muted rounded-lg">
          <div class="text-sm space-y-1">
            <div>
              <strong>{{ $t('ttsSettings.currentConfig.name') }}:</strong>
              {{ activeConfig.name }}
            </div>
            <div>
              <strong>{{ $t('ttsSettings.currentConfig.endpoint') }}:</strong>
              <span class="text-muted-foreground">
                {{ truncateEndpoint(activeConfig.config.apiEndpoint) }}
              </span>
            </div>
            <div>
              <strong>{{ $t('ttsSettings.currentConfig.apiKey') }}:</strong>
              <span class="text-muted-foreground">
                {{
                  activeConfig.config.apiKey
                    ? '******' + activeConfig.config.apiKey.slice(-4)
                    : $t('ttsSettings.currentConfig.notConfigured')
                }}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 无配置提示 -->
    <Card v-else>
      <CardContent class="py-8">
        <div class="text-center text-muted-foreground">
          <Volume2 class="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{{ $t('ttsSettings.noConfig.message') }}</p>
          <Button
            variant="outline"
            size="sm"
            class="mt-4"
            @click="showConfigManager = true"
          >
            {{ $t('ttsSettings.noConfig.addConfig') }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 配置管理弹窗 -->
    <TTSConfigManager
      v-if="showConfigManager"
      :settings="settings"
      @close="showConfigManager = false"
      @save="handleSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Volume2, Settings, Settings2 } from 'lucide-vue-next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { browser } from 'wxt/browser';
import type { UserSettings } from '@/src/modules/shared/types/storage';
import type { FullTextTTSConfigItem } from '@/src/modules/shared/types/fullTextTTS';
import { DEFAULT_SETTINGS } from '@/src/modules/shared/constants/defaults';
import TTSConfigManager from './TTSConfigManager.vue';

const { t } = useI18n();

const emit = defineEmits<{
  saveMessage: [message: string];
}>();

// 设置数据
const settings = ref<UserSettings>({ ...DEFAULT_SETTINGS });
const showConfigManager = ref(false);

// 当前激活的配置
const activeConfig = computed<FullTextTTSConfigItem | undefined>(() => {
  return settings.value.fullTextTTSConfigs.find(
    (c) => c.id === settings.value.activeFullTextTTSConfigId,
  );
});

// 加载设置
onMounted(async () => {
  const stored = await browser.storage.local.get('settings');
  if (stored.settings) {
    // 合并默认设置
    const merged = { ...DEFAULT_SETTINGS, ...stored.settings };

    // 迁移：如果没有 TTS 配置，应用新的默认 TTS 设置
    if (
      !stored.settings.fullTextTTSConfigs ||
      stored.settings.fullTextTTSConfigs.length === 0
    ) {
      console.log('[TTSSettings] Migrating TTS settings with new defaults');
      merged.enableFullTextTTSBar = DEFAULT_SETTINGS.enableFullTextTTSBar;
      merged.fullTextTTSBarCollapsed = DEFAULT_SETTINGS.fullTextTTSBarCollapsed;
      merged.fullTextTTSConfigs = DEFAULT_SETTINGS.fullTextTTSConfigs;
      merged.activeFullTextTTSConfigId =
        DEFAULT_SETTINGS.activeFullTextTTSConfigId;
      // 保存迁移后的设置
      await browser.storage.local.set({ settings: merged });
    }

    settings.value = merged;
  }
});

// 监听设置变化并保存
watch(
  settings,
  async (newSettings) => {
    await browser.storage.local.set({ settings: newSettings });
  },
  { deep: true },
);

// 切换 TTS 底栏
const toggleTTSBar = async (checked: boolean) => {
  console.log('[TTSSettings] Toggle TTS bar:', checked);
  settings.value.enableFullTextTTSBar = checked;
  // 立即保存到存储
  await browser.storage.local.set({ settings: settings.value });
  console.log(
    '[TTSSettings] Settings saved:',
    settings.value.enableFullTextTTSBar,
  );
  emit('saveMessage', t('common.saved'));
};

// 处理保存
const handleSave = () => {
  emit('saveMessage', t('common.saved'));
};

// 截断端点显示
const truncateEndpoint = (endpoint: string): string => {
  if (endpoint.length <= 40) return endpoint;
  return endpoint.substring(0, 37) + '...';
};
</script>
