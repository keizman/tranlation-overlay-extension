<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/src/composables/useAuth';

interface Props {
  open?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { login } = useAuth();

const isOpen = computed({
  get: () => props.open ?? false,
  set: (value) => emit('update:open', value),
});

const usernameOrEmail = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const handleSubmit = async () => {
  error.value = '';

  if (!usernameOrEmail.value || !password.value) {
    error.value = '请填写完整信息';
    return;
  }

  loading.value = true;

  try {
    await login(usernameOrEmail.value, password.value);

    usernameOrEmail.value = '';
    password.value = '';

    isOpen.value = false;
  } catch (err: any) {
    error.value = err.message || '登录失败,请检查用户名和密码';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogTrigger as-child>
      <slot />
    </DialogTrigger>
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>登录</DialogTitle>
      </DialogHeader>
      <form @submit.prevent="handleSubmit" class="grid gap-4 py-4">
        <div class="grid gap-2">
          <Label for="username-or-email">用户名或邮箱</Label>
          <Input
            id="username-or-email"
            v-model="usernameOrEmail"
            placeholder="输入用户名或邮箱"
            :disabled="loading"
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="password">密码</Label>
          <Input
            id="password"
            v-model="password"
            type="password"
            placeholder="输入密码"
            :disabled="loading"
            required
          />
        </div>

        <div v-if="error" class="text-sm text-destructive">
          {{ error }}
        </div>

        <Button type="submit" :disabled="loading" class="w-full">
          {{ loading ? '登录中...' : '登录' }}
        </Button>
      </form>
    </DialogContent>
  </Dialog>
</template>
