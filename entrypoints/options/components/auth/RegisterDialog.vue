<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
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

const { t } = useI18n();

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

const handleFocusIn = (event: FocusEvent) => {
  const target = event.target as HTMLElement | null;
  if (!target || typeof target.scrollIntoView !== 'function') {
    return;
  }
  window.setTimeout(() => {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 120);
};

const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

const validate = () => {
  if (username.value.length < 3) {
    error.value = t('auth.usernameMinLength');
    return false;
  }
  if (!emailRegex.test(email.value)) {
    error.value = t('auth.invalidEmail');
    return false;
  }
  if (password.value.length < 8) {
    error.value = t('auth.passwordMinLength');
    return false;
  }
  if (password.value !== confirmPassword.value) {
    error.value = t('auth.passwordMismatch');
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
    error.value = err.message || t('auth.registerFailed');
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
    <DialogContent
      class="sm:max-w-[425px] top-[max(1rem,env(safe-area-inset-top))] -translate-y-0 sm:top-1/2 sm:-translate-y-1/2 max-h-[85dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <DialogHeader>
        <DialogTitle>{{ $t('auth.registerAccount') }}</DialogTitle>
      </DialogHeader>
      <form
        @submit.prevent="handleSubmit"
        @focusin="handleFocusIn"
        class="grid gap-4 py-4"
      >
        <div class="grid gap-2">
          <Label for="username">{{ $t('auth.username') }}</Label>
          <Input
            id="username"
            v-model="username"
            :placeholder="$t('auth.usernamePlaceholder')"
            :disabled="loading"
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="email">{{ $t('auth.email') }}</Label>
          <Input
            id="email"
            v-model="email"
            type="email"
            :placeholder="$t('auth.emailPlaceholder')"
            :disabled="loading"
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="password">{{ $t('auth.password') }}</Label>
          <Input
            id="password"
            v-model="password"
            type="password"
            :placeholder="$t('auth.passwordPlaceholder')"
            :disabled="loading"
            required
          />
        </div>
        <div class="grid gap-2">
          <Label for="confirm-password">{{ $t('auth.confirmPassword') }}</Label>
          <Input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            :placeholder="$t('auth.confirmPasswordPlaceholder')"
            :disabled="loading"
            required
          />
        </div>

        <div v-if="error" class="text-sm text-destructive">
          {{ error }}
        </div>

        <Button type="submit" :disabled="loading" class="w-full">
          {{ loading ? $t('auth.registering') : $t('auth.register') }}
        </Button>
      </form>
    </DialogContent>
  </Dialog>
</template>
