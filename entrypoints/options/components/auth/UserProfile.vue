<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { Avatar } from '@/components/ui/avatar';
import { useAuth } from '@/src/composables/useAuth';
import { LogOut, ChevronDown } from 'lucide-vue-next';

const { t } = useI18n();
const { user, logout } = useAuth();

const handleLogout = async () => {
  try {
    await logout();
  } catch (error) {
    console.error('Logout failed:', error);
  }
};
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        class="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-border/50 bg-background hover:bg-accent hover:text-accent-foreground transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Avatar
          :fallback="user?.displayName || user?.username || ''"
          :src="user?.avatar"
          size="sm"
          class="cursor-pointer h-7 w-7"
        />
        <span
          class="text-sm font-medium hidden sm:inline truncate max-w-[100px]"
        >
          {{ user?.displayName || user?.username }}
        </span>
        <ChevronDown class="h-4 w-4 text-muted-foreground opacity-50" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <div class="flex items-center gap-3 p-2 bg-muted/50 m-1 rounded-md">
        <Avatar
          :fallback="user?.displayName || user?.username || ''"
          :src="user?.avatar"
          size="sm"
        />
        <div class="flex flex-col overflow-hidden">
          <p class="text-sm font-medium truncate">
            {{ user?.displayName || user?.username }}
          </p>
          <p class="text-xs text-muted-foreground truncate">
            {{ user?.email }}
          </p>
        </div>
      </div>

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <!-- Future: Add Profile/Settings links here if needed -->
        <!-- 
        <DropdownMenuItem>
          <User class="mr-2 h-4 w-4" />
          <span>{{ t('auth.profile') }}</span>
        </DropdownMenuItem>
        -->
      </DropdownMenuGroup>

      <DropdownMenuItem
        class="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-100/50 dark:focus:bg-red-900/20 cursor-pointer"
        @click="handleLogout"
      >
        <LogOut class="mr-2 h-4 w-4" />
        <span>{{ t('auth.logout') }}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
