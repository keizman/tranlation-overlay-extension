<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="close"
  >
    <div
      class="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
    >
      <!-- 头部 -->
      <div class="flex items-center justify-between p-4 border-b border-border">
        <h2 class="text-xl font-semibold text-foreground">
          {{
            isEditing
              ? $t('ttsSettings.configManager.editConfig')
              : $t('ttsSettings.configManager.title')
          }}
        </h2>
        <button
          @click="close"
          class="p-2 hover:bg-muted rounded-md transition-colors"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- 内容区域 -->
      <div class="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
        <!-- 编辑模式 -->
        <div v-if="isEditing" class="space-y-4">
          <TTSConfigEditor
            :config="editingConfig"
            @save="handleSaveConfig"
            @cancel="cancelEdit"
          />
        </div>

        <!-- 列表模式 -->
        <div v-else class="space-y-4">
          <!-- 当前激活配置选择 -->
          <div class="space-y-2">
            <Label>{{ $t('ttsSettings.configManager.currentActive') }}</Label>
            <Select
              :model-value="localSettings.activeFullTextTTSConfigId"
              @update:model-value="handleActiveChange"
            >
              <SelectTrigger>
                <SelectValue
                  :placeholder="$t('ttsSettings.configManager.selectConfig')"
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="config in localSettings.fullTextTTSConfigs"
                  :key="config.id"
                  :value="config.id"
                >
                  {{ config.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 配置列表 -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Label>{{ $t('ttsSettings.configManager.manageConfigs') }}</Label>
              <Button variant="outline" size="sm" @click="addNewConfig">
                <PlusCircle class="h-4 w-4 mr-1" />
                {{ $t('ttsSettings.configManager.addConfig') }}
              </Button>
            </div>

            <div
              v-for="config in localSettings.fullTextTTSConfigs"
              :key="config.id"
              class="p-3 border rounded-lg bg-muted/30"
              :class="{
                'border-primary border-2':
                  config.id === localSettings.activeFullTextTTSConfigId,
              }"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">{{ config.name }}</div>
                  <div class="text-sm text-muted-foreground">
                    {{ truncateEndpoint(config.config.apiEndpoint) }}
                  </div>
                </div>
                <div class="flex gap-2">
                  <Button variant="ghost" size="sm" @click="editConfig(config)">
                    <Edit class="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    @click="deleteConfig(config.id)"
                    :disabled="localSettings.fullTextTTSConfigs.length <= 1"
                  >
                    <Trash2 class="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>

            <!-- 空状态 -->
            <div
              v-if="localSettings.fullTextTTSConfigs.length === 0"
              class="text-center py-8 text-muted-foreground"
            >
              {{ $t('ttsSettings.configManager.noConfigs') }}
            </div>
          </div>
        </div>
      </div>

      <!-- 底部 -->
      <div class="flex justify-end gap-2 p-4 border-t border-border">
        <Button variant="outline" @click="close">
          {{ $t('common.cancel') }}
        </Button>
        <Button v-if="!isEditing" @click="saveAndClose">
          {{ $t('common.save') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { X, PlusCircle, Edit, Trash2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UserSettings } from '@/src/modules/shared/types/storage';
import type { FullTextTTSConfigItem } from '@/src/modules/shared/types/fullTextTTS';
// TODO: Fix Rollup TypeScript parsing for fullTextTTS module
// import { DEFAULT_TTS_ENDPOINT } from '@/src/modules/fullTextTTS/constants';
const DEFAULT_TTS_ENDPOINT =
  'https://texttospeech.googleapis.com/v1beta1/text:synthesize';
import TTSConfigEditor from './TTSConfigEditor.vue';

const { t } = useI18n();

interface Props {
  settings: UserSettings;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  save: [];
}>();

const isOpen = ref(true);
const isEditing = ref(false);
const editingConfig = ref<FullTextTTSConfigItem | null>(null);
const localSettings = ref<UserSettings>({ ...props.settings });

// 同步 props 变化
watch(
  () => props.settings,
  (newSettings) => {
    localSettings.value = { ...newSettings };
  },
  { deep: true },
);

// 关闭弹窗
const close = () => {
  isOpen.value = false;
  emit('close');
};

// 保存并关闭
const saveAndClose = () => {
  Object.assign(props.settings, localSettings.value);
  emit('save');
  close();
};

// 切换激活配置
const handleActiveChange = (configId: unknown) => {
  if (typeof configId === 'string' && configId) {
    localSettings.value.activeFullTextTTSConfigId = configId;
  }
};

// 添加新配置
const addNewConfig = () => {
  const newConfig: FullTextTTSConfigItem = {
    id: `tts-config-${Date.now()}`,
    name: t('ttsSettings.configManager.newConfigName'),
    config: {
      apiEndpoint: DEFAULT_TTS_ENDPOINT,
      apiKey: '',
      customParams: '',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  editingConfig.value = newConfig;
  isEditing.value = true;
};

// 编辑配置
const editConfig = (config: FullTextTTSConfigItem) => {
  editingConfig.value = { ...config, config: { ...config.config } };
  isEditing.value = true;
};

// 保存配置
const handleSaveConfig = (config: FullTextTTSConfigItem) => {
  const index = localSettings.value.fullTextTTSConfigs.findIndex(
    (c) => c.id === config.id,
  );
  if (index >= 0) {
    localSettings.value.fullTextTTSConfigs[index] = config;
  } else {
    localSettings.value.fullTextTTSConfigs.push(config);
    // 如果是第一个配置，自动激活
    if (localSettings.value.fullTextTTSConfigs.length === 1) {
      localSettings.value.activeFullTextTTSConfigId = config.id;
    }
  }
  isEditing.value = false;
  editingConfig.value = null;
};

// 取消编辑
const cancelEdit = () => {
  isEditing.value = false;
  editingConfig.value = null;
};

// 删除配置
const deleteConfig = (configId: string) => {
  const index = localSettings.value.fullTextTTSConfigs.findIndex(
    (c) => c.id === configId,
  );
  if (index >= 0) {
    localSettings.value.fullTextTTSConfigs.splice(index, 1);
    // 如果删除的是当前激活配置，切换到第一个
    if (localSettings.value.activeFullTextTTSConfigId === configId) {
      localSettings.value.activeFullTextTTSConfigId =
        localSettings.value.fullTextTTSConfigs[0]?.id || '';
    }
  }
};

// 截断端点显示
const truncateEndpoint = (endpoint: string): string => {
  if (endpoint.length <= 50) return endpoint;
  return endpoint.substring(0, 47) + '...';
};
</script>
