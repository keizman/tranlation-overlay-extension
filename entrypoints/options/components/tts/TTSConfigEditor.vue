<template>
  <div class="space-y-4">
    <!-- 配置名称 -->
    <div class="space-y-2">
      <Label for="config-name">
        {{ $t('ttsSettings.configEditor.configName') }}
      </Label>
      <Input
        id="config-name"
        v-model="localConfig.name"
        :placeholder="$t('ttsSettings.configEditor.configNamePlaceholder')"
      />
    </div>

    <!-- API 端点 -->
    <div class="space-y-2">
      <Label for="api-endpoint">
        {{ $t('ttsSettings.configEditor.apiEndpoint') }}
      </Label>
      <Input
        id="api-endpoint"
        v-model="localConfig.config.apiEndpoint"
        :placeholder="DEFAULT_TTS_ENDPOINT"
      />
      <p class="text-xs text-muted-foreground">
        {{ $t('ttsSettings.configEditor.endpointHint') }}
      </p>
    </div>

    <!-- API Key -->
    <div class="space-y-2">
      <Label for="api-key">{{ $t('ttsSettings.configEditor.apiKey') }}</Label>
      <div class="relative">
        <Input
          id="api-key"
          v-model="localConfig.config.apiKey"
          :type="showApiKey ? 'text' : 'password'"
          placeholder="YOUR_API_KEY"
        />
        <button
          type="button"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          @click="showApiKey = !showApiKey"
        >
          <Eye v-if="!showApiKey" class="h-4 w-4" />
          <EyeOff v-else class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- 可选添加额外 JSON 参数 -->
    <div class="space-y-2">
      <Label for="custom-params">
        {{ $t('ttsSettings.configEditor.customParams') }}
      </Label>
      <Textarea
        id="custom-params"
        v-model="localConfig.config.customParams"
        :placeholder="`{\n  &quot;voice&quot;: { &quot;name&quot;: &quot;en-US-Neural2-J&quot; },\n  &quot;audioConfig&quot;: { &quot;speakingRate&quot;: 1.1 }\n}`"
        rows="4"
        class="font-mono text-sm"
      />
      <p class="text-xs text-muted-foreground">
        {{ $t('ttsSettings.configEditor.customParamsHint') }}
      </p>
    </div>

    <!-- 测试连接 -->
    <div class="flex items-center gap-4">
      <Button
        variant="outline"
        @click="testConnection"
        :disabled="isTesting || !localConfig.config.apiKey"
      >
        <Loader2 v-if="isTesting" class="h-4 w-4 mr-2 animate-spin" />
        <Wifi v-else class="h-4 w-4 mr-2" />
        {{ $t('ttsSettings.configEditor.testConnection') }}
      </Button>
      <div
        v-if="testResult"
        class="text-sm"
        :class="testResult.success ? 'text-green-600' : 'text-red-600'"
      >
        {{
          testResult.success
            ? $t('ttsSettings.configEditor.testSuccess')
            : testResult.error
        }}
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="flex justify-end gap-2 pt-4 border-t border-border">
      <Button variant="outline" @click="cancel">
        {{ $t('common.cancel') }}
      </Button>
      <Button @click="save" :disabled="!isValid">
        {{ $t('common.save') }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Eye, EyeOff, Wifi, Loader2 } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type {
  FullTextTTSConfigItem,
  FullTextTTSConfig,
} from '@/src/modules/shared/types/fullTextTTS';

// 默认 TTS 端点
const DEFAULT_TTS_ENDPOINT =
  'https://texttospeech.googleapis.com/v1beta1/text:synthesize';

// 内联 TTS 测试连接函数 (避免导入有构建问题的模块)
async function testTTSConnection(
  config: FullTextTTSConfig,
): Promise<{ success: boolean; error?: string }> {
  const endpoint = config.apiEndpoint || DEFAULT_TTS_ENDPOINT;
  const url = `${endpoint}?key=${config.apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        input: { text: 'Hello, this is a test.' },
        voice: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData?.error?.message || response.statusText;
      return {
        success: false,
        error: `API 错误 (${response.status}): ${errorMessage}`,
      };
    }

    const data = await response.json();
    if (!data.audioContent) {
      return { success: false, error: 'API 返回空音频内容' };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return { success: false, error: errorMessage };
  }
}

useI18n();

interface Props {
  config: FullTextTTSConfigItem | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  save: [config: FullTextTTSConfigItem];
  cancel: [];
}>();

// 本地配置副本
const localConfig = ref<FullTextTTSConfigItem>({
  id: '',
  name: '',
  config: {
    apiEndpoint: DEFAULT_TTS_ENDPOINT,
    apiKey: '',
    customParams: '',
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// 同步 props
watch(
  () => props.config,
  (newConfig) => {
    if (newConfig) {
      localConfig.value = {
        ...newConfig,
        config: { ...newConfig.config },
      };
    }
  },
  { immediate: true },
);

// UI 状态
const showApiKey = ref(false);
const isTesting = ref(false);
const testResult = ref<{ success: boolean; error?: string } | null>(null);

// 验证
const isValid = computed(() => {
  return (
    localConfig.value.name.trim() !== '' &&
    localConfig.value.config.apiKey.trim() !== ''
  );
});

// 测试连接
const testConnection = async () => {
  if (!localConfig.value.config.apiKey) return;

  console.log('[TTSConfig] 开始测试连接:', {
    endpoint: localConfig.value.config.apiEndpoint,
    hasApiKey: !!localConfig.value.config.apiKey,
  });

  isTesting.value = true;
  testResult.value = null;

  try {
    testResult.value = await testTTSConnection(localConfig.value.config);
    console.log('[TTSConfig] 测试结果:', testResult.value);
  } catch (error) {
    console.error('[TTSConfig] 测试异常:', error);
    testResult.value = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    isTesting.value = false;
  }
};

// 保存
const save = () => {
  localConfig.value.updatedAt = Date.now();
  emit('save', {
    ...localConfig.value,
    config: { ...localConfig.value.config },
  });
};

// 取消
const cancel = () => {
  emit('cancel');
};
</script>
