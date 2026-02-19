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
            <div class="my-filters-editor__viewport">
              <pre
                class="my-filters-editor__highlight"
                aria-hidden="true"
                :style="{ transform: `translateY(-${editorScrollTop}px)` }"
                v-html="highlightedCustomFiltersHtml"
              />
              <textarea
                ref="editorTextareaRef"
                v-model="customFiltersDraft"
                rows="10"
                spellcheck="false"
                class="my-filters-editor__textarea"
                @focus="handleCustomFiltersEditorFocus"
                @blur="handleCustomFiltersEditorBlur"
                @scroll="handleCustomFiltersEditorScroll"
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
          <span class="text-sm text-muted-foreground">
            {{
              $t('websiteManagement.customFiltersLineCount', {
                count: customFiltersLineCount,
              })
            }}
          </span>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Copy,
  Edit3,
  Globe,
  Heart,
  Plus,
  Search,
  Shield,
  Trash2,
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
import WebsiteRuleDialog from './WebsiteRuleDialog.vue';

const { t } = useI18n();
const manager = new WebsiteManager();
const EDITOR_LINE_HEIGHT_PX = 20;
const MIN_EDITOR_COLUMNS = 16;
const EDITOR_VISIBLE_TOP_GAP_PX = 72;
const EDITOR_VISIBLE_BOTTOM_GAP_PX = 20;

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
const editorTextareaRef = ref<HTMLTextAreaElement | null>(null);
const editorScrollTop = ref(0);
const editorColumns = ref(80);
const keyboardInsetPx = ref(0);
const editorFocused = ref(false);
const scrollContainerRef = ref<HTMLElement | null>(null);
let editorResizeObserver: ResizeObserver | null = null;

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
  return Array.from({ length: lineCount }, (_, index) => {
    const line = lines[index] ?? '';
    const wrappedRows = getWrappedRows(line);
    return {
      number: index + 1,
      rows: wrappedRows,
      height: wrappedRows * EDITOR_LINE_HEIGHT_PX,
    };
  });
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

onMounted(async () => {
  await loadSettings();
  await nextTick();
  setupEditorMetricsObserver();
  resolveScrollContainer();
  window.visualViewport?.addEventListener('resize', handleVisualViewportChange);
  window.visualViewport?.addEventListener('scroll', handleVisualViewportChange);
});
onBeforeUnmount(() => {
  editorResizeObserver?.disconnect();
  editorResizeObserver = null;
  window.removeEventListener('resize', handleWindowViewportResize);
  window.visualViewport?.removeEventListener(
    'resize',
    handleVisualViewportChange,
  );
  window.visualViewport?.removeEventListener(
    'scroll',
    handleVisualViewportChange,
  );
  resetScrollPaddingBottom();
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
const handleCustomFiltersEditorScroll = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  editorScrollTop.value = target.scrollTop;
};
const focusCustomFiltersEditor = () => {
  editorTextareaRef.value?.focus();
};
const handleCustomFiltersEditorFocus = () => {
  editorFocused.value = true;
  resolveScrollContainer();
  updateKeyboardInset();
  scrollEditorIntoView();
  window.setTimeout(() => {
    updateKeyboardInset();
    scrollEditorIntoView();
  }, 220);
};
const handleCustomFiltersEditorBlur = () => {
  editorFocused.value = false;
  keyboardInsetPx.value = 0;
  resetScrollPaddingBottom();
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
  if (!viewport) {
    keyboardInsetPx.value = 0;
    resetScrollPaddingBottom();
    return;
  }

  const keyboardHeight = Math.max(
    0,
    window.innerHeight - viewport.height - viewport.offsetTop,
  );
  keyboardInsetPx.value = keyboardHeight > 0 ? keyboardHeight + 16 : 0;
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
};
const resetScrollPaddingBottom = () => {
  const scrollContainer = resolveScrollContainer();
  if (!scrollContainer) {
    return;
  }
  scrollContainer.style.scrollPaddingBottom = '';
};
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

  if (bottomOverflow > 0) {
    if (scrollContainer && scrollContainer !== document.scrollingElement) {
      scrollContainer.scrollTop += bottomOverflow;
    } else {
      window.scrollBy({ top: bottomOverflow, behavior: 'auto' });
    }
  } else if (topOverflow < 0) {
    if (scrollContainer && scrollContainer !== document.scrollingElement) {
      scrollContainer.scrollTop += topOverflow;
    } else {
      window.scrollBy({ top: topOverflow, behavior: 'auto' });
    }
  }

  textarea.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
  });
};
const updateEditorLayoutMetrics = () => {
  const textarea = editorTextareaRef.value;
  if (!textarea) {
    return;
  }

  const style = window.getComputedStyle(textarea);
  const fontSize = parseFloat(style.fontSize || '12');
  const fontWeight = style.fontWeight || '400';
  const fontFamily = style.fontFamily || 'monospace';
  const charWidth = measureMonospaceCharWidth(fontSize, fontWeight, fontFamily);
  const horizontalPadding =
    parseFloat(style.paddingLeft || '0') +
    parseFloat(style.paddingRight || '0');
  const contentWidth = Math.max(1, textarea.clientWidth - horizontalPadding);
  editorColumns.value = Math.max(
    MIN_EDITOR_COLUMNS,
    Math.floor(contentWidth / Math.max(1, charWidth)),
  );
};
const handleWindowViewportResize = () => {
  updateEditorLayoutMetrics();
  if (!editorFocused.value) {
    return;
  }
  updateKeyboardInset();
  scrollEditorIntoView();
};
const setupEditorMetricsObserver = () => {
  updateEditorLayoutMetrics();

  if (typeof ResizeObserver !== 'undefined' && editorTextareaRef.value) {
    editorResizeObserver = new ResizeObserver(() => {
      updateEditorLayoutMetrics();
    });
    editorResizeObserver.observe(editorTextareaRef.value);
  }

  window.addEventListener('resize', handleWindowViewportResize);
};
const measureMonospaceCharWidth = (
  fontSize: number,
  fontWeight: string,
  fontFamily: string,
): number => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return 7;
  }
  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  return context.measureText('M').width || 7;
};
const getWrappedRows = (line: string): number => {
  const normalizedLine = line.replace(/\t/g, '  ');
  const length = Math.max(1, normalizedLine.length);
  const columns = Math.max(MIN_EDITOR_COLUMNS, editorColumns.value);
  return Math.max(1, Math.ceil(length / columns));
};

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
    domainHtml,
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
  pointer-events: none;
  min-height: 240px;
  overflow: visible;
  color: hsl(var(--foreground));
}

.my-filters-editor__textarea {
  position: relative;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: hsl(var(--foreground));
  height: 240px;
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
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  margin-left: 0.35rem;
  max-width: calc(100% - 0.35rem);
  flex-wrap: wrap;
}

.my-filters-editor__highlight .mf-comment {
  color: #94a3b8;
  font-style: italic;
}

.my-filters-editor__highlight .mf-domain {
  color: #60a5fa;
  font-weight: 600;
  text-shadow: 0 0 10px rgba(96, 165, 250, 0.25);
}

.my-filters-editor__highlight .mf-comma {
  color: #93c5fd;
}

.my-filters-editor__highlight .mf-marker {
  color: #f59e0b;
  font-weight: 700;
}

.my-filters-editor__highlight .mf-exception {
  color: #fb7185;
  font-weight: 700;
}

.my-filters-editor__highlight .mf-selector {
  color: #22c55e;
  padding-left: 0.35rem;
  border-left: 1px dashed rgba(34, 197, 94, 0.6);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.my-filters-editor__highlight .mf-selector-empty {
  opacity: 0;
}

.my-filters-editor__highlight .mf-plain {
  color: hsl(var(--foreground));
}
</style>
