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
  success: [];
}>();

const { register } = useAuth();

const isOpen = computed({
  get: () => props.open ?? false,
  set: (value) => emit('update:open', value),
});

const username = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const loading = ref(false);

const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

const validate = () => {
  if (username.value.length < 3) {
    error.value = '用户名至少需要3个字符';
    return false;
  }
  if (!emailRegex.test(email.value)) {
    error.value = '请输入有效的邮箱地址';
    return false;
  }
  if (password.value.length < 8) {
    error.value = '密码至少需要8个字符';
    return false;
  }
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致';
    return false;
  }
  return true;
};

const handleSubmit = async () => {
  error.value = '';

  if (!validate()) {
    return;
  }

  loading.value = true;

  try {
    await register(
      username.value,
      email.value,
      password.value,
      confirmPassword.value,
    );

    username.value = '';
    email.value = '';
    password.value = '';
    confirmPassword.value = '';

    emit('success');
    isOpen.value = false;
  } catch (err: any) {
    error.value = err.message || '注册失败,请重试';
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
        <DialogTitle>注册账号</DialogTitle>
      </DialogHeader>
      <form @submit.prevent="handleSubmit" class="grid gap-4 py-4">
        <div class="grid gap-2">
          <Label for="username">用户名</Label>
          <Input
            id="username"
            v-model="username"
            placeholder="至少3个字符"
            :disabled="loading"
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="email">邮箱</Label>
          <Input
            id="email"
            v-model="email"
            type="email"
            placeholder="your@email.com"
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
            placeholder="至少8个字符"
            :disabled="loading"
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="confirm-password">确认密码</Label>
          <Input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            placeholder="再次输入密码"
            :disabled="loading"
            required
          />
        </div>

        <div v-if="error" class="text-sm text-destructive">
          {{ error }}
        </div>

        <Button type="submit" :disabled="loading" class="w-full">
          {{ loading ? '注册中...' : '注册' }}
        </Button>
      </form>
    </DialogContent>
  </Dialog>
</template>
