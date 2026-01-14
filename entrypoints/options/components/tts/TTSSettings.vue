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

    <!-- 语音模型选择 -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle>
          <h2 class="text-2xl font-bold text-foreground">Voice Model</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-3">
          <label
            class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
            :class="
              settings.fullTextTTSVoiceName === 'en-US-Standard-H'
                ? 'bg-primary/10 border-primary'
                : 'border-border hover:bg-muted/50'
            "
          >
            <input
              type="radio"
              name="voiceModel"
              value="en-US-Standard-H"
              v-model="settings.fullTextTTSVoiceName"
              class="w-4 h-4 text-primary"
              @change="saveSettings"
            />
            <div>
              <div class="font-medium">en-US-Standard-H</div>
              <div class="text-sm text-muted-foreground">
                Standard quality, fast response
              </div>
            </div>
          </label>
          <label
            class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
            :class="
              settings.fullTextTTSVoiceName === 'en-US-Chirp3-HD-Erinome'
                ? 'bg-primary/10 border-primary'
                : 'border-border hover:bg-muted/50'
            "
          >
            <input
              type="radio"
              name="voiceModel"
              value="en-US-Chirp3-HD-Erinome"
              v-model="settings.fullTextTTSVoiceName"
              class="w-4 h-4 text-primary"
              @change="saveSettings"
            />
            <div>
              <div class="font-medium">en-US-Chirp3-HD-Erinome</div>
              <div class="text-sm text-muted-foreground">
                High-definition, natural voice
              </div>
            </div>
          </label>
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
import { Settings, Settings2, Volume2 } from 'lucide-vue-next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { browser } from 'wxt/browser';
import type { UserSettings } from '@/src/modules/shared/types/storage';
import type { FullTextTTSConfigItem } from '@/src/modules/shared/types/fullTextTTS';
import { DEFAULT_SETTINGS } from '@/src/modules/shared/constants/defaults';
import { StorageService } from '@/src/modules/core/storage';
import TTSConfigManager from './TTSConfigManager.vue';

const { t } = useI18n();

const emit = defineEmits<{
  saveMessage: [message: string];
}>();

// 设置数据
const settings = ref<UserSettings>({ ...DEFAULT_SETTINGS });
const showConfigManager = ref(false);
const storageService = StorageService.getInstance();

// 当前激活的配置
const activeConfig = computed<FullTextTTSConfigItem | undefined>(() => {
  return settings.value.fullTextTTSConfigs.find(
    (c) => c.id === settings.value.activeFullTextTTSConfigId,
  );
});

// 加载设置
onMounted(async () => {
  // 使用 StorageService 加载设置，保持与其他设置页面一致
  const loadedSettings = await storageService.getUserSettings();

  // 迁移：如果没有 TTS 配置，应用新的默认 TTS 设置
  let needsSave = false;
  if (
    !loadedSettings.fullTextTTSConfigs ||
    loadedSettings.fullTextTTSConfigs.length === 0
  ) {
    console.log('[TTSSettings] Migrating TTS settings with new defaults');
    loadedSettings.enableFullTextTTSBar = DEFAULT_SETTINGS.enableFullTextTTSBar;
    loadedSettings.fullTextTTSBarCollapsed =
      DEFAULT_SETTINGS.fullTextTTSBarCollapsed;
    loadedSettings.fullTextTTSConfigs = DEFAULT_SETTINGS.fullTextTTSConfigs;
    loadedSettings.activeFullTextTTSConfigId =
      DEFAULT_SETTINGS.activeFullTextTTSConfigId;
    needsSave = true;
  }

  // 迁移：如果没有语音模型设置，使用默认值
  if (!loadedSettings.fullTextTTSVoiceName) {
    console.log('[TTSSettings] Migrating voice model with default');
    loadedSettings.fullTextTTSVoiceName = DEFAULT_SETTINGS.fullTextTTSVoiceName;
    needsSave = true;
  }

  if (needsSave) {
    await storageService.saveUserSettings(loadedSettings);
  }

  settings.value = loadedSettings;

  // 检查 URL 参数是否要求自动打开配置管理器
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('openConfigManager') === 'true') {
    showConfigManager.value = true;
  }
});

// 监听设置变化并保存
watch(
  settings,
  async (newSettings) => {
    await storageService.saveUserSettings(newSettings);
  },
  { deep: true },
);

// 保存设置 (用于语音模型切换时)
const saveSettings = async () => {
  await storageService.saveUserSettings(settings.value);
  const voiceName = settings.value.fullTextTTSVoiceName;
  console.log('[TTSSettings] Voice model switched to:', voiceName);
  emit('saveMessage', `语音模型已切换: ${voiceName}`);
  // 通知其他组件设置已更新
  browser.runtime.sendMessage({
    type: 'settings_updated',
    settings: settings.value,
  });
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
