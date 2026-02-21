<template>
  <div class="mx-auto space-y-6" :style="pageRootStyle">
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 class="text-2xl font-bold text-foreground">
            {{ $t('websiteManagement.title') }}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-6">
        <p class="text-muted-foreground">
          {{ $t('websiteManagement.description') }}
        </p>

        <div class="bg-card rounded-lg border border-border p-4">
          <div
            class="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between"
          >
            <div class="flex flex-col sm:flex-row gap-3 flex-1">
              <div class="relative flex-1 max-w-md">
                <Search
                  class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground"
                />
                <input
                  v-model="searchQuery"
                  type="text"
                  :placeholder="$t('websiteManagement.search')"
                  class="w-full pl-10 pr-4 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div class="flex gap-2">
                <button
                  @click="filterType = 'all'"
                  :class="[
                    'px-3 py-2 rounded-md text-sm transition-colors',
                    filterType === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border hover:bg-accent hover:text-accent-foreground',
                  ]"
                >
                  {{ $t('websiteManagement.filterAll') }} ({{
                    allRules.length
                  }})
                </button>
                <button
                  @click="filterType = 'blacklist'"
                  :class="[
                    'px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-1',
                    filterType === 'blacklist'
                      ? 'bg-red-600 text-white'
                      : 'border border-border hover:bg-accent hover:text-accent-foreground',
                  ]"
                >
                  <Shield class="w-3 h-3" />
                  {{ $t('websiteManagement.filterBlacklist') }}
                  ({{ blacklistCount }})
                </button>
                <button
                  @click="filterType = 'whitelist'"
                  :class="[
                    'px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-1',
                    filterType === 'whitelist'
                      ? 'bg-green-600 text-white'
                      : 'border border-border hover:bg-accent hover:text-accent-foreground',
                  ]"
                >
                  <Heart class="w-3 h-3" />
                  {{ $t('websiteManagement.filterWhitelist') }}
                  ({{ whitelistCount }})
                </button>
              </div>
            </div>

            <div class="flex gap-2">
              <button
                @click="showAddDialog = true"
                class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                <Plus class="w-4 h-4" />
                {{ $t('websiteManagement.addRule') }}
              </button>

              <button
                v-if="selectedRules.length > 0"
                @click="bulkDeleteRules"
                class="inline-flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
              >
                <Trash2 class="w-4 h-4" />
                {{ $t('websiteManagement.deleteSelected') }}
                ({{ selectedRules.length }})
              </button>
            </div>
          </div>
        </div>

        <div class="bg-card rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-12">
                  <input
                    v-model="selectAll"
                    @change="handleSelectAll"
                    type="checkbox"
                    class="rounded border-border focus:ring-ring"
                  />
                </TableHead>
                <TableHead class="w-24">
                  {{ $t('websiteManagement.tableType') }}
                </TableHead>
                <TableHead class="w-96">
                  {{ $t('websiteManagement.tablePattern') }}
                </TableHead>
                <TableHead class="w-64">
                  {{ $t('websiteManagement.tableDescription') }}
                </TableHead>
                <TableHead class="w-20">
                  {{ $t('websiteManagement.tableStatus') }}
                </TableHead>
                <TableHead class="w-12 text-right">
                  {{ $t('websiteManagement.tableActions') }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="rule in filteredRules"
                :key="rule.id"
                class="hover:bg-muted/25"
              >
                <TableCell>
                  <input
                    v-model="selectedRules"
                    :value="rule.id"
                    type="checkbox"
                    class="rounded border-border focus:ring-ring"
                  />
                </TableCell>
                <TableCell>
                  <div class="flex items-center gap-1">
                    <div
                      :class="[
                        'p-1 rounded-full',
                        rule.type === 'blacklist'
                          ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                          : 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400',
                      ]"
                    >
                      <Shield
                        v-if="rule.type === 'blacklist'"
                        class="w-3 h-3"
                      />
                      <Heart v-else class="w-3 h-3" />
                    </div>
                    <span class="text-xs font-medium">
                      {{
                        rule.type === 'blacklist'
                          ? $t('websiteManagement.blacklist')
                          : $t('websiteManagement.whitelist')
                      }}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="group relative">
                    <code
                      class="px-2 py-1 bg-muted rounded text-sm font-mono block truncate pr-8"
                      :title="rule.pattern"
                    >
                      {{ rule.pattern }}
                    </code>
                    <button
                      @click="copyToClipboard(rule.pattern)"
                      class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-background rounded"
                      :title="$t('websiteManagement.copy')"
                    >
                      <Copy class="w-3 h-3" />
                    </button>
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    class="text-sm text-muted-foreground block truncate"
                    :title="rule.description || '-'"
                  >
                    {{ rule.description || '-' }}
                  </span>
                </TableCell>
                <TableCell>
                  <button
                    @click="toggleRule(rule.id)"
                    :class="[
                      'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors',
                      rule.enabled
                        ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-900/20 dark:text-gray-400',
                    ]"
                  >
                    <div
                      :class="[
                        'w-1.5 h-1.5 rounded-full',
                        rule.enabled ? 'bg-green-500' : 'bg-gray-400',
                      ]"
                    />
                    {{
                      rule.enabled
                        ? $t('websiteManagement.enabled')
                        : $t('websiteManagement.disabled')
                    }}
                  </button>
                </TableCell>
                <TableCell class="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" class="h-8 w-8 p-0">
                        <span class="sr-only">
                          {{ $t('websiteManagement.openMenu') }}
                        </span>
                        <svg
                          class="h-4 w-4"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
                          />
                        </svg>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="editRule(rule)">
                        <Edit3 class="mr-2 h-4 w-4" />
                        {{ $t('websiteManagement.edit') }}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        @click="removeRule(rule.id)"
                        class="text-destructive"
                      >
                        <Trash2 class="mr-2 h-4 w-4" />
                        {{ $t('websiteManagement.delete') }}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div v-if="filteredRules.length === 0" class="text-center py-12">
            <Globe class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 class="text-lg font-medium text-foreground mb-2">
              {{
                searchQuery
                  ? $t('websiteManagement.noMatchingRules')
                  : $t('websiteManagement.noRules')
              }}
            </h3>
            <p class="text-muted-foreground mb-4">
              {{
                searchQuery
                  ? $t('websiteManagement.tryOtherKeywords')
                  : $t('websiteManagement.startAddingRules')
              }}
            </p>
            <button
              v-if="!searchQuery"
              @click="showAddDialog = true"
              class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus class="w-4 h-4" />
              {{ $t('websiteManagement.addFirstRule') }}
            </button>
          </div>
        </div>

        <div class="text-sm text-muted-foreground">
          {{ $t('websiteManagement.totalRules', { count: allRules.length }) }}
          <span v-if="searchQuery || filterType !== 'all'">
            {{
              $t('websiteManagement.showingResults', {
                count: filteredRules.length,
              })
            }}
          </span>
          <span class="ml-4">
            {{
              $t('websiteManagement.blacklistCount', { count: blacklistCount })
            }}
            |
            {{
              $t('websiteManagement.whitelistCount', { count: whitelistCount })
            }}
          </span>
        </div>

        <WebsiteRuleDialog
          v-if="showAddDialog"
          :rule="editingRule"
          :is-editing="!!editingRule"
          @save="handleSaveRule"
          @cancel="handleCancelEdit"
        />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>
          <div>
            <h3 class="text-xl font-semibold text-foreground">
              {{ $t('websiteManagement.myFiltersTitle') }}
            </h3>
            <p class="text-sm text-muted-foreground font-normal mt-1">
              {{ $t('websiteManagement.myFiltersDescription') }}
            </p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div
          class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div class="flex items-center gap-3">
            <span class="text-sm text-muted-foreground">
              {{ $t('websiteManagement.enableMyCustomFilters') }}
            </span>
            <Switch
              :model-value="customFiltersEnabled"
              @update:model-value="handleCustomFiltersEnabledChange"
            />
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium text-foreground">
            {{ $t('websiteManagement.myFiltersTitle') }}
          </label>
          <div class="my-filters-editor" @click="focusCustomFiltersEditor">
            <div class="my-filters-editor__gutter">
              <div
                class="my-filters-editor__gutter-scroll"
                :style="{ transform: `translateY(-${editorScrollTop}px)` }"
              >
                <div
                  v-for="lineMetric in editorLineMetrics"
                  :key="lineMetric.number"
                  class="my-filters-editor__line-number"
                  :style="{ height: `${lineMetric.height}px` }"
                >
                  {{ lineMetric.number }}
                </div>
              </div>
            </div>
            <div
              class="my-filters-editor__viewport"
              :style="editorViewportStyle"
            >
              <pre
                ref="editorHighlightRef"
                class="my-filters-editor__highlight"
                aria-hidden="true"
                :style="{
                  transform: `translateY(-${editorScrollTop}px)`,
                }"
                v-html="highlightedCustomFiltersHtml"
              />
              <textarea
                ref="editorTextareaRef"
                v-model="customFiltersDraft"
                rows="10"
                wrap="soft"
                spellcheck="false"
                class="my-filters-editor__textarea"
                :style="editorTextareaStyle"
                @focus="handleCustomFiltersEditorFocus"
                @blur="handleCustomFiltersEditorBlur"
                @scroll="handleCustomFiltersEditorScroll"
                @click="handleCustomFiltersEditorCaretChange"
                @keyup="handleCustomFiltersEditorCaretChange"
                @input="handleCustomFiltersEditorCaretChange"
              />
            </div>
          </div>
          <p class="text-xs text-muted-foreground">
            {{ $t('websiteManagement.myFiltersHint') }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Button
            @click="saveCustomFiltersText"
            :disabled="!hasCustomFiltersChanges"
          >
            {{ $t('websiteManagement.applyFiltersText') }}
          </Button>
          <Button
            variant="outline"
            @click="resetCustomFiltersDraft"
            :disabled="!hasCustomFiltersChanges"
          >
            {{ $t('websiteManagement.revertFiltersText') }}
          </Button>

          <div
            class="hidden sm:block w-px h-6 bg-border mx-1"
            aria-hidden="true"
          />

          <Button
            variant="outline"
            @click="downloadCustomFiltersFromCloud"
            :disabled="
              downloadingCloudFilters ||
              uploadingCloudFilters ||
              !hasCloudSyncUser
            "
            size="sm"
            class="gap-1.5"
            title="Requires login"
          >
            <Download v-if="!downloadingCloudFilters" class="w-3.5 h-3.5" />
            <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
            Download from Cloud
          </Button>
          <Button
            variant="outline"
            @click="uploadCustomFiltersToCloud"
            :disabled="
              uploadingCloudFilters ||
              downloadingCloudFilters ||
              !hasCloudSyncUser
            "
            size="sm"
            class="gap-1.5"
            title="Requires login"
          >
            <Upload v-if="!uploadingCloudFilters" class="w-3.5 h-3.5" />
            <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
            Upload to Cloud
          </Button>

          <span class="text-xs text-muted-foreground ml-auto">
            {{
              $t('websiteManagement.customFiltersLineCount', {
                count: customFiltersLineCount,
              })
            }}
          </span>
          <Transition name="cloud-status">
            <span
              v-if="cloudSyncMessage"
              class="text-xs font-medium"
              :class="
                cloudSyncError
                  ? 'text-destructive'
                  : 'text-green-600 dark:text-green-400'
              "
            >
              {{ cloudSyncMessage }}
            </span>
          </Transition>
          <span
            v-if="!hasCloudSyncUser"
            class="text-xs text-muted-foreground font-medium"
          >
            Login required for cloud sync
          </span>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Copy,
  Download,
  Edit3,
  Globe,
  Heart,
  Loader2,
  Plus,
  Search,
  Shield,
  Trash2,
  Upload,
} from 'lucide-vue-next';
import { browser } from 'wxt/browser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { WebsiteManager } from '@/src/modules/options/website-management/manager';
import { WebsiteRule } from '@/src/modules/options/website-management/types';
import { MessageType } from '@/src/modules/core/messaging/types';
import { httpClient } from '@/src/modules/auth/RequestInterceptor';
import WebsiteRuleDialog from './WebsiteRuleDialog.vue';

const { t } = useI18n();
const manager = new WebsiteManager();
const WEBSITE_FILTERS_CONF_KEY = 'website_filters_text';
const WEBSITE_FILTERS_CLOUD_ENDPOINT = `/api/business/conf/${WEBSITE_FILTERS_CONF_KEY}`;
const BASE_EDITOR_HEIGHT_PX = 240;
const MIN_EDITOR_HEIGHT_PX = 120;
const EDITOR_LINE_HEIGHT_PX = 20;
const EDITOR_VISIBLE_TOP_GAP_PX = 72;
const EDITOR_VISIBLE_BOTTOM_GAP_PX = 20;
const EDITOR_FOCUS_SYNC_TICKS = 12;
const EDITOR_FOCUS_SYNC_INTERVAL_MS = 90;
const KEYBOARD_INSET_EXTRA_PX = 16;
const KEYBOARD_FALLBACK_THRESHOLD_PX = 120;
const KEYBOARD_MIN_MOBILE_INSET_PX = 180;

const allRules = ref<WebsiteRule[]>([]);
const customFiltersEnabled = ref(true);
const customFiltersText = ref('');
const customFiltersDraft = ref('');
const searchQuery = ref('');
const filterType = ref<'all' | 'blacklist' | 'whitelist'>('all');
const selectedRules = ref<string[]>([]);
const selectAll = ref(false);
const showAddDialog = ref(false);
const editingRule = ref<WebsiteRule | null>(null);
const uploadingCloudFilters = ref(false);
const downloadingCloudFilters = ref(false);
const cloudSyncMessage = ref('');
const cloudSyncError = ref(false);
const cloudSyncUserId = ref('');

const blacklistCount = computed(
  () => allRules.value.filter((rule) => rule.type === 'blacklist').length,
);

const whitelistCount = computed(
  () => allRules.value.filter((rule) => rule.type === 'whitelist').length,
);

const filteredRules = computed(() => {
  let rules = allRules.value;
  if (filterType.value !== 'all') {
    rules = rules.filter((rule) => rule.type === filterType.value);
  }
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    rules = rules.filter(
      (rule) =>
        rule.pattern.toLowerCase().includes(query) ||
        rule.description?.toLowerCase().includes(query),
    );
  }
  return rules;
});

const hasCustomFiltersChanges = computed(
  () => customFiltersDraft.value !== customFiltersText.value,
);
const hasCloudSyncUser = computed(() => cloudSyncUserId.value.length > 0);
const editorHighlightRef = ref<HTMLElement | null>(null);
const editorTextareaRef = ref<HTMLTextAreaElement | null>(null);
const editorScrollTop = ref(0);
const keyboardInsetPx = ref(0);
const editorFocused = ref(false);
const scrollContainerRef = ref<HTMLElement | null>(null);
const measuredLineHeights = ref<number[]>([]);
let focusSyncTimer: number | null = null;
let focusSyncTick = 0;
let viewportHeightBaselinePx = 0;
let editorResizeObserver: ResizeObserver | null = null;
let lineHeightMeasureRafId: number | null = null;
let wrapMeasureElement: HTMLDivElement | null = null;

const customFiltersLineCount = computed(
  () =>
    customFiltersDraft.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('!')).length,
);
const editorLineMetrics = computed(() => {
  const lines = customFiltersDraft.value.split(/\r?\n/);
  const lineCount = Math.max(1, lines.length);
  return Array.from({ length: lineCount }, (_, index) => ({
    number: index + 1,
    rows: Math.max(
      1,
      Math.ceil(
        (measuredLineHeights.value[index] ?? EDITOR_LINE_HEIGHT_PX) /
          EDITOR_LINE_HEIGHT_PX,
      ),
    ),
    height: measuredLineHeights.value[index] ?? EDITOR_LINE_HEIGHT_PX,
  }));
});
const highlightedCustomFiltersHtml = computed(() => {
  const normalizedText = customFiltersDraft.value.replace(/\r\n/g, '\n');
  if (!normalizedText) {
    return `<div class="mf-line"><span class="mf-token mf-placeholder">${escapeHtml(
      t('websiteManagement.myFiltersTextareaPlaceholder'),
    )}</span></div>`;
  }

  return normalizedText
    .split('\n')
    .map((line) => `<div class="mf-line">${buildHighlightedLine(line)}</div>`)
    .join('');
});
const pageRootStyle = computed(() => {
  if (keyboardInsetPx.value <= 0) {
    return undefined;
  }
  return {
    paddingBottom: `${keyboardInsetPx.value}px`,
  };
});
const editorHeightPx = computed(() => {
  if (keyboardInsetPx.value <= 0) {
    return BASE_EDITOR_HEIGHT_PX;
  }
  return Math.max(
    MIN_EDITOR_HEIGHT_PX,
    BASE_EDITOR_HEIGHT_PX - keyboardInsetPx.value,
  );
});
const editorViewportStyle = computed(() => ({
  height: `${editorHeightPx.value}px`,
  minHeight: `${editorHeightPx.value}px`,
}));
const editorTextareaStyle = computed(() => ({
  height: `${editorHeightPx.value}px`,
}));

onMounted(async () => {
  await refreshCloudSyncIdentity();
  await loadSettings();
  await nextTick();
  setupEditorMetricsObserver();
  scheduleLineHeightMeasurement();
  refreshViewportHeightBaseline();
  resolveScrollContainer();
  browser.storage.onChanged.addListener(handleCloudSyncStorageChange);
  window.visualViewport?.addEventListener('resize', handleVisualViewportChange);
  window.visualViewport?.addEventListener('scroll', handleVisualViewportChange);
});
onBeforeUnmount(() => {
  stopFocusSync();
  if (lineHeightMeasureRafId !== null) {
    window.cancelAnimationFrame(lineHeightMeasureRafId);
    lineHeightMeasureRafId = null;
  }
  editorResizeObserver?.disconnect();
  editorResizeObserver = null;
  if (wrapMeasureElement?.parentNode) {
    wrapMeasureElement.parentNode.removeChild(wrapMeasureElement);
  }
  wrapMeasureElement = null;
  window.removeEventListener('resize', handleWindowViewportResize);
  window.visualViewport?.removeEventListener(
    'resize',
    handleVisualViewportChange,
  );
  window.visualViewport?.removeEventListener(
    'scroll',
    handleVisualViewportChange,
  );
  browser.storage.onChanged.removeListener(handleCloudSyncStorageChange);
  resetScrollPaddingBottom();
});
watch(customFiltersDraft, async () => {
  await nextTick();
  scheduleLineHeightMeasurement();
});

const loadSettings = async () => {
  try {
    const settings = await manager.getSettingsSnapshot();
    allRules.value = settings.rules;
    customFiltersEnabled.value = settings.customFiltersEnabled;
    customFiltersText.value = settings.customFiltersText || '';
    customFiltersDraft.value = customFiltersText.value;
  } catch (error) {
    console.error(t('errors.loadRulesFailed'), error);
  }
};

const notifyWebsiteManagementUpdated = async () => {
  try {
    await browser.runtime.sendMessage({
      type: MessageType.WEBSITE_MANAGEMENT_UPDATED,
    });
  } catch {
    // ignore when no background handler is ready
  }
};

const handleSelectAll = () => {
  if (selectAll.value) {
    selectedRules.value = filteredRules.value.map((rule) => rule.id);
  } else {
    selectedRules.value = [];
  }
};

const editRule = (rule: WebsiteRule) => {
  editingRule.value = rule;
  showAddDialog.value = true;
};

const handleSaveRule = async (
  ruleData: Omit<WebsiteRule, 'id' | 'createdAt'>,
) => {
  try {
    if (editingRule.value) {
      await manager.updateRule(editingRule.value.id, ruleData);
    } else {
      await manager.addRule(
        ruleData.pattern,
        ruleData.type,
        ruleData.description,
      );
    }

    await loadSettings();
    await notifyWebsiteManagementUpdated();
    handleCancelEdit();
  } catch (error) {
    console.error(t('errors.saveRuleFailed'), error);
  }
};

const handleCancelEdit = () => {
  showAddDialog.value = false;
  editingRule.value = null;
};

const removeRule = async (id: string) => {
  if (!confirm(t('websiteManagement.confirmDeleteRule'))) return;
  try {
    await manager.removeRule(id);
    await loadSettings();
    await notifyWebsiteManagementUpdated();
    selectedRules.value = selectedRules.value.filter((ruleId) => ruleId !== id);
  } catch (error) {
    console.error(t('errors.deleteRuleFailed'), error);
  }
};

const bulkDeleteRules = async () => {
  if (
    !confirm(
      t('websiteManagement.confirmDeleteSelected', {
        count: selectedRules.value.length,
      }),
    )
  ) {
    return;
  }
  try {
    await manager.removeRules(selectedRules.value);
    await loadSettings();
    await notifyWebsiteManagementUpdated();
    selectedRules.value = [];
    selectAll.value = false;
  } catch (error) {
    console.error(t('errors.batchDeleteRulesFailed'), error);
  }
};

const toggleRule = async (id: string) => {
  try {
    await manager.toggleRule(id);
    await loadSettings();
    await notifyWebsiteManagementUpdated();
  } catch (error) {
    console.error(t('errors.toggleRuleStatusFailed'), error);
  }
};

const handleCustomFiltersEnabledChange = async (enabled: boolean) => {
  try {
    await manager.setCustomFiltersEnabled(enabled);
    customFiltersEnabled.value = enabled;
    await notifyWebsiteManagementUpdated();
  } catch (error) {
    console.error('Failed to change custom filter toggle:', error);
  }
};

const saveCustomFiltersText = async () => {
  try {
    await manager.setCustomFiltersText(customFiltersDraft.value);
    customFiltersText.value = customFiltersDraft.value;
    await notifyWebsiteManagementUpdated();
  } catch (error) {
    console.error('Failed to save custom filter text:', error);
  }
};

const resetCustomFiltersDraft = () => {
  customFiltersDraft.value = customFiltersText.value;
};
const showCloudSyncStatus = (message: string, isError = false) => {
  cloudSyncMessage.value = message;
  cloudSyncError.value = isError;
  window.setTimeout(() => {
    if (cloudSyncMessage.value === message) {
      cloudSyncMessage.value = '';
    }
  }, 3500);
};
const normalizeStorageString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';
const refreshCloudSyncIdentity = async () => {
  try {
    const stored = await browser.storage.local.get('userId');
    cloudSyncUserId.value = normalizeStorageString(stored?.userId);
  } catch (error) {
    console.error('Failed to read cloud sync identity:', error);
    cloudSyncUserId.value = '';
  }
};
type StorageChangeLike = { newValue?: unknown };
const handleCloudSyncStorageChange = (
  changes: Record<string, StorageChangeLike>,
  areaName: string,
) => {
  if (areaName !== 'local' || !changes.userId) {
    return;
  }
  cloudSyncUserId.value = normalizeStorageString(changes.userId.newValue);
};
const ensureCloudSyncUser = async (): Promise<boolean> => {
  await refreshCloudSyncIdentity();
  if (hasCloudSyncUser.value) {
    return true;
  }
  showCloudSyncStatus('Please log in to use cloud sync', true);
  return false;
};
const readResponseMessage = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  try {
    const payload = await response.clone().json();
    if (typeof payload?.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    // ignore json parse failure, use fallback
  }
  return fallback;
};
const extractCloudFiltersText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { text?: unknown }).text === 'string'
  ) {
    return (value as { text: string }).text;
  }
  return '';
};
const uploadCustomFiltersToCloud = async () => {
  if (uploadingCloudFilters.value) return;
  if (!(await ensureCloudSyncUser())) return;
  uploadingCloudFilters.value = true;
  try {
    const response = await httpClient.put(WEBSITE_FILTERS_CLOUD_ENDPOINT, {
      value: { text: customFiltersDraft.value },
    });
    if (!response.ok) {
      const message = await readResponseMessage(
        response,
        'Upload to cloud failed',
      );
      throw new Error(message);
    }
    showCloudSyncStatus('Uploaded to cloud');
  } catch (error) {
    console.error('Failed to upload custom filters to cloud:', error);
    showCloudSyncStatus(
      error instanceof Error ? error.message : 'Upload to cloud failed',
      true,
    );
  } finally {
    uploadingCloudFilters.value = false;
  }
};
const downloadCustomFiltersFromCloud = async () => {
  if (downloadingCloudFilters.value) return;
  if (!(await ensureCloudSyncUser())) return;
  downloadingCloudFilters.value = true;
  try {
    const response = await httpClient.get(WEBSITE_FILTERS_CLOUD_ENDPOINT);
    if (response.status === 404) {
      showCloudSyncStatus('No cloud filters found', true);
      return;
    }
    if (!response.ok) {
      const message = await readResponseMessage(
        response,
        'Download from cloud failed',
      );
      throw new Error(message);
    }
    const payload = await response.json();
    customFiltersDraft.value = extractCloudFiltersText(payload?.value);
    showCloudSyncStatus('Downloaded from cloud into editor');
  } catch (error) {
    console.error('Failed to download custom filters from cloud:', error);
    showCloudSyncStatus(
      error instanceof Error ? error.message : 'Download from cloud failed',
      true,
    );
  } finally {
    downloadingCloudFilters.value = false;
  }
};
const handleCustomFiltersEditorScroll = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  editorScrollTop.value = target.scrollTop;
};
const focusCustomFiltersEditor = () => {
  editorTextareaRef.value?.focus();
};
const handleCustomFiltersEditorFocus = () => {
  editorFocused.value = true;
  refreshViewportHeightBaseline();
  resolveScrollContainer();
  startFocusSync();
};
const handleCustomFiltersEditorBlur = () => {
  editorFocused.value = false;
  stopFocusSync();
  keyboardInsetPx.value = 0;
  refreshViewportHeightBaseline();
  resetScrollPaddingBottom();
};
const handleCustomFiltersEditorCaretChange = () => {
  if (!editorFocused.value) {
    return;
  }
  scrollEditorIntoView();
};
const handleVisualViewportChange = () => {
  if (!editorFocused.value) {
    return;
  }
  updateKeyboardInset();
  scrollEditorIntoView();
};
const resolveScrollContainer = () => {
  if (scrollContainerRef.value) {
    return scrollContainerRef.value;
  }

  const textarea = editorTextareaRef.value;
  if (!textarea) {
    return null;
  }

  const overflowContainer = textarea.closest(
    '.overflow-y-auto',
  ) as HTMLElement | null;
  scrollContainerRef.value =
    overflowContainer || (document.scrollingElement as HTMLElement | null);
  return scrollContainerRef.value;
};
const updateKeyboardInset = () => {
  if (!editorFocused.value) {
    return;
  }

  const viewport = window.visualViewport;
  const viewportHeightWithOffset = viewport
    ? viewport.height + viewport.offsetTop
    : 0;
  const baseline = Math.max(
    viewportHeightBaselinePx,
    window.innerHeight,
    document.documentElement.clientHeight,
    viewportHeightWithOffset,
  );
  const viewportKeyboardHeight = viewport
    ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    : 0;
  const fallbackCandidates = [
    Math.max(0, baseline - window.innerHeight),
    Math.max(0, baseline - document.documentElement.clientHeight),
    Math.max(0, baseline - viewportHeightWithOffset),
  ];
  const fallbackKeyboardHeight = Math.max(...fallbackCandidates);
  let keyboardHeight = Math.max(
    viewportKeyboardHeight,
    fallbackKeyboardHeight >= KEYBOARD_FALLBACK_THRESHOLD_PX
      ? fallbackKeyboardHeight
      : 0,
  );

  if (
    keyboardHeight <= 0 &&
    isLikelyMobileViewport() &&
    document.activeElement === editorTextareaRef.value
  ) {
    keyboardHeight = KEYBOARD_MIN_MOBILE_INSET_PX;
  }

  keyboardInsetPx.value =
    keyboardHeight > 0 ? keyboardHeight + KEYBOARD_INSET_EXTRA_PX : 0;
  applyScrollPaddingBottom();
};
const applyScrollPaddingBottom = () => {
  const scrollContainer = resolveScrollContainer();
  if (!scrollContainer) {
    return;
  }
  const value =
    keyboardInsetPx.value > 0 ? `${keyboardInsetPx.value + 24}px` : '';
  scrollContainer.style.scrollPaddingBottom = value;
  scrollContainer.style.paddingBottom = value;
};
const resetScrollPaddingBottom = () => {
  const scrollContainer = resolveScrollContainer();
  if (!scrollContainer) {
    return;
  }
  scrollContainer.style.scrollPaddingBottom = '';
  scrollContainer.style.paddingBottom = '';
};
const stopFocusSync = () => {
  if (focusSyncTimer !== null) {
    window.clearTimeout(focusSyncTimer);
    focusSyncTimer = null;
  }
  focusSyncTick = 0;
};
const runFocusSyncTick = () => {
  if (!editorFocused.value) {
    stopFocusSync();
    return;
  }
  updateKeyboardInset();
  scrollEditorIntoView();
  focusSyncTick += 1;
  if (focusSyncTick >= EDITOR_FOCUS_SYNC_TICKS) {
    stopFocusSync();
    return;
  }
  focusSyncTimer = window.setTimeout(
    runFocusSyncTick,
    EDITOR_FOCUS_SYNC_INTERVAL_MS,
  );
};
const startFocusSync = () => {
  stopFocusSync();
  runFocusSyncTick();
};
const isRootScrollElement = (element: HTMLElement | null): boolean =>
  !element ||
  element === (document.scrollingElement as HTMLElement | null) ||
  element === document.documentElement ||
  element === document.body;
const scrollEditorIntoView = () => {
  const textarea = editorTextareaRef.value;
  if (!textarea) {
    return;
  }

  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBottom = viewport
    ? viewport.offsetTop + viewport.height
    : window.innerHeight;
  const visibleTop = viewportTop + EDITOR_VISIBLE_TOP_GAP_PX;
  const visibleBottom = Math.max(
    visibleTop + 1,
    viewportBottom - EDITOR_VISIBLE_BOTTOM_GAP_PX,
  );

  const rect = textarea.getBoundingClientRect();
  const bottomOverflow = rect.bottom - visibleBottom;
  const topOverflow = rect.top - visibleTop;
  const scrollContainer = resolveScrollContainer();
  const canUseCustomScroller =
    !!scrollContainer && !isRootScrollElement(scrollContainer);

  if (bottomOverflow > 0) {
    if (canUseCustomScroller) {
      scrollContainer.scrollTop += bottomOverflow;
    } else {
      window.scrollBy({ top: bottomOverflow, behavior: 'auto' });
    }
  } else if (topOverflow < 0) {
    if (canUseCustomScroller) {
      scrollContainer.scrollTop += topOverflow;
    } else {
      window.scrollBy({ top: topOverflow, behavior: 'auto' });
    }
  }

  const caretPosition = textarea.selectionStart ?? textarea.value.length;
  const textBeforeCaret = textarea.value.slice(0, caretPosition);
  const caretSegments = textBeforeCaret.split('\n');
  const caretLineIndex = Math.max(0, caretSegments.length - 1);
  const caretLineFragment = caretSegments[caretLineIndex] ?? '';
  const lines = textarea.value.split(/\r?\n/);
  let caretTop = 0;
  for (let index = 0; index < caretLineIndex; index += 1) {
    caretTop += measuredLineHeights.value[index] ?? EDITOR_LINE_HEIGHT_PX;
  }
  const caretRowInLine = Math.max(1, getWrappedRowsForText(caretLineFragment));
  caretTop += (caretRowInLine - 1) * EDITOR_LINE_HEIGHT_PX;
  const currentLineHeight =
    measuredLineHeights.value[caretLineIndex] ??
    getWrappedRowsForText(lines[caretLineIndex] ?? '') * EDITOR_LINE_HEIGHT_PX;
  const caretBottom = Math.min(
    caretTop + EDITOR_LINE_HEIGHT_PX,
    caretTop + currentLineHeight,
  );
  const visibleTopInTextarea = textarea.scrollTop;
  const visibleBottomInTextarea = textarea.scrollTop + textarea.clientHeight;

  if (caretBottom > visibleBottomInTextarea - EDITOR_LINE_HEIGHT_PX) {
    textarea.scrollTop = Math.max(
      0,
      caretBottom - textarea.clientHeight + EDITOR_LINE_HEIGHT_PX * 2,
    );
    editorScrollTop.value = textarea.scrollTop;
  } else if (caretTop < visibleTopInTextarea + EDITOR_LINE_HEIGHT_PX) {
    textarea.scrollTop = Math.max(0, caretTop - EDITOR_LINE_HEIGHT_PX);
    editorScrollTop.value = textarea.scrollTop;
  }
};
const handleWindowViewportResize = () => {
  scheduleLineHeightMeasurement();
  if (!editorFocused.value) {
    refreshViewportHeightBaseline();
    return;
  }
  updateKeyboardInset();
  scrollEditorIntoView();
};
const setupEditorMetricsObserver = () => {
  window.addEventListener('resize', handleWindowViewportResize);
  const textarea = editorTextareaRef.value;
  if (typeof ResizeObserver !== 'undefined' && textarea) {
    editorResizeObserver?.disconnect();
    editorResizeObserver = new ResizeObserver(() => {
      scheduleLineHeightMeasurement();
    });
    editorResizeObserver.observe(textarea);
  }
};
const scheduleLineHeightMeasurement = () => {
  if (lineHeightMeasureRafId !== null) {
    window.cancelAnimationFrame(lineHeightMeasureRafId);
  }
  lineHeightMeasureRafId = window.requestAnimationFrame(() => {
    lineHeightMeasureRafId = null;
    measureLineHeights();
  });
};
const measureLineHeights = () => {
  const highlight = editorHighlightRef.value;
  if (!highlight) {
    return;
  }
  const lineElements = highlight.querySelectorAll<HTMLElement>('.mf-line');
  if (lineElements.length === 0) {
    measuredLineHeights.value = [EDITOR_LINE_HEIGHT_PX];
    return;
  }
  measuredLineHeights.value = Array.from(lineElements, (lineElement) =>
    Math.max(EDITOR_LINE_HEIGHT_PX, Math.round(lineElement.offsetHeight)),
  );
};
const ensureWrapMeasureElement = () => {
  if (wrapMeasureElement) {
    return wrapMeasureElement;
  }
  wrapMeasureElement = document.createElement('div');
  wrapMeasureElement.style.position = 'absolute';
  wrapMeasureElement.style.left = '-99999px';
  wrapMeasureElement.style.top = '-99999px';
  wrapMeasureElement.style.visibility = 'hidden';
  wrapMeasureElement.style.pointerEvents = 'none';
  wrapMeasureElement.style.whiteSpace = 'pre-wrap';
  wrapMeasureElement.style.overflowWrap = 'anywhere';
  wrapMeasureElement.style.wordBreak = 'break-word';
  wrapMeasureElement.style.boxSizing = 'border-box';
  wrapMeasureElement.style.padding = '0';
  wrapMeasureElement.style.margin = '0';
  wrapMeasureElement.style.border = '0';
  document.body.appendChild(wrapMeasureElement);
  return wrapMeasureElement;
};
const getWrapMeasureWidth = () => {
  const textarea = editorTextareaRef.value;
  if (!textarea) {
    return 0;
  }
  const styles = window.getComputedStyle(textarea);
  const horizontalPadding =
    parseFloat(styles.paddingLeft || '0') +
    parseFloat(styles.paddingRight || '0');
  return Math.max(1, textarea.clientWidth - horizontalPadding);
};
const getWrappedRowsForText = (text: string): number => {
  const textarea = editorTextareaRef.value;
  if (!textarea) {
    return 1;
  }
  const measureElement = ensureWrapMeasureElement();
  const styles = window.getComputedStyle(textarea);
  const width = getWrapMeasureWidth();
  measureElement.style.width = `${width}px`;
  measureElement.style.fontFamily = styles.fontFamily;
  measureElement.style.fontSize = styles.fontSize;
  measureElement.style.fontWeight = styles.fontWeight;
  measureElement.style.fontStyle = styles.fontStyle;
  measureElement.style.letterSpacing = styles.letterSpacing;
  measureElement.style.lineHeight = styles.lineHeight;
  measureElement.style.tabSize = styles.tabSize;
  measureElement.textContent =
    text.length > 0 ? text.replace(/\t/g, '  ') : ' ';
  const measuredHeight = Math.max(
    EDITOR_LINE_HEIGHT_PX,
    Math.round(measureElement.offsetHeight),
  );
  return Math.max(1, Math.ceil(measuredHeight / EDITOR_LINE_HEIGHT_PX));
};
const refreshViewportHeightBaseline = () => {
  viewportHeightBaselinePx = Math.max(
    viewportHeightBaselinePx,
    window.innerHeight,
    document.documentElement.clientHeight,
    window.visualViewport
      ? window.visualViewport.height + window.visualViewport.offsetTop
      : 0,
  );
};
const isLikelyMobileViewport = (): boolean =>
  window.innerWidth <= 900 || window.matchMedia('(pointer: coarse)').matches;

const buildHighlightedLine = (line: string): string => {
  if (!line) {
    return '&nbsp;';
  }

  const trimmedLine = line.trimStart();
  if (trimmedLine.startsWith('!')) {
    return `<span class="mf-token mf-comment">${escapeHtml(line)}</span>`;
  }

  const marker = line.includes('#@#') ? '#@#' : line.includes('##') ? '##' : '';
  if (!marker) {
    return `<span class="mf-token mf-plain">${escapeHtml(line)}</span>`;
  }

  const markerIndex = line.indexOf(marker);
  const domainPart = line.slice(0, markerIndex);
  const selectorPart = line.slice(markerIndex + marker.length);
  const domainHtml = domainPart
    .split(/(\s*,\s*)/g)
    .map((segment) => {
      if (!segment) return '';
      if (segment.includes(',')) {
        return `<span class="mf-token mf-comma">${escapeHtml(segment)}</span>`;
      }
      return `<span class="mf-token mf-domain">${escapeHtml(segment)}</span>`;
    })
    .join('');

  const markerClass = marker === '#@#' ? 'mf-exception' : 'mf-marker';
  const selectorHtml = selectorPart
    ? escapeHtml(selectorPart)
    : '<span class="mf-token mf-selector-empty">&nbsp;</span>';

  return [
    `<span class="mf-domain-group">${domainHtml || '&nbsp;'}</span>`,
    `<span class="mf-token-group">`,
    `<span class="mf-token ${markerClass}">${escapeHtml(marker)}</span>`,
    `<span class="mf-token mf-selector">${selectorHtml}</span>`,
    `</span>`,
  ].join('');
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error(t('errors.copyFailed'), error);
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
};
</script>

<style>
.my-filters-editor {
  display: flex;
  min-height: 240px;
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  overflow: hidden;
  background: hsl(var(--background));
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
}

.my-filters-editor__gutter {
  width: 44px;
  background: hsl(var(--muted) / 0.45);
  border-right: 1px solid hsl(var(--border));
  position: relative;
  overflow: hidden;
  user-select: none;
}

.my-filters-editor__gutter-scroll {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 0.55rem 0.45rem;
}

.my-filters-editor__line-number {
  line-height: 20px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  text-align: right;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

.my-filters-editor__viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 240px;
  min-height: 240px;
  overflow: hidden;
}

.my-filters-editor__highlight,
.my-filters-editor__textarea {
  margin: 0;
  padding: 0.55rem 0.75rem;
  font-size: 12px;
  line-height: 20px;
  letter-spacing: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  tab-size: 2;
  width: 100%;
  box-sizing: border-box;
}

.my-filters-editor__highlight {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
  color: hsl(var(--foreground));
}

.my-filters-editor__textarea {
  position: relative;
  z-index: 2;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: hsl(var(--foreground) / 0.01);
  -webkit-text-fill-color: transparent;
  caret-color: hsl(var(--foreground));
  overflow-y: auto;
  overflow-x: hidden;
}

.my-filters-editor__textarea::selection {
  background: rgba(59, 130, 246, 0.3);
}

.my-filters-editor__highlight .mf-placeholder {
  color: #94a3b8;
}

.my-filters-editor__highlight .mf-line {
  display: block;
  min-height: 20px;
  line-height: 20px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.my-filters-editor__highlight .mf-token-group {
  display: inline;
  margin-left: 0;
  background: transparent;
  box-shadow: inset 0 -0.45em rgba(34, 197, 94, 0.08);
}

.my-filters-editor__highlight .mf-domain-group {
  background: transparent;
  box-shadow: inset 0 -0.45em rgba(96, 165, 250, 0.08);
}

.my-filters-editor__highlight .mf-comment {
  color: #94a3b8;
  font-style: italic;
}

.my-filters-editor__highlight .mf-domain {
  color: #60a5fa;
  text-shadow: 0 0 10px rgba(96, 165, 250, 0.25);
}

.my-filters-editor__highlight .mf-comma {
  color: #93c5fd;
}

.my-filters-editor__highlight .mf-marker {
  color: #f59e0b;
  text-shadow: 0 0 8px rgba(245, 158, 11, 0.28);
}

.my-filters-editor__highlight .mf-exception {
  color: #fb7185;
  text-shadow: 0 0 8px rgba(251, 113, 133, 0.28);
}

.my-filters-editor__highlight .mf-selector {
  color: #22c55e;
  padding-left: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.my-filters-editor__highlight .mf-selector-empty {
  opacity: 0;
}

.my-filters-editor__highlight .mf-plain {
  color: hsl(var(--foreground));
}

.cloud-status-enter-active,
.cloud-status-leave-active {
  transition: opacity 0.25s ease;
}

.cloud-status-enter-from,
.cloud-status-leave-to {
  opacity: 0;
}
</style>
