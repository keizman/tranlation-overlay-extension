<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar } from '@/components/ui/avatar';
import { useAuth } from '@/src/composables/useAuth';

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
        class="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <Avatar
          :fallback="user?.displayName || user?.username || ''"
          :src="user?.avatar"
          size="md"
          class="cursor-pointer"
        />
        <span class="text-sm font-medium hidden sm:inline">
          {{ user?.displayName || user?.username }}
        </span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <div class="flex items-center gap-2 px-2 py-1.5">
        <Avatar
          :fallback="user?.displayName || user?.username || ''"
          :src="user?.avatar"
          size="sm"
        />
        <div class="flex flex-col gap-0.5">
          <p class="text-sm font-medium">
            {{ user?.displayName || user?.username }}
          </p>
          <p class="text-xs text-muted-foreground">{{ user?.email }}</p>
        </div>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" @click="handleLogout">
        退出登录
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
