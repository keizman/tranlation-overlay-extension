<script setup lang="ts">
import { ref, computed, watch } from 'vue';
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
}>();

const { login, isLoggedIn } = useAuth();

const isOpen = computed({
  get: () => props.open ?? false,
  set: (value) => emit('update:open', value),
});

const usernameOrEmail = ref('');
const password = ref('');
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

const handleSubmit = async () => {
  error.value = '';

  if (!usernameOrEmail.value || !password.value) {
    error.value = t('auth.fillComplete');
    return;
  }

  loading.value = true;

  try {
    await login(usernameOrEmail.value, password.value);

    usernameOrEmail.value = '';
    password.value = '';

    isOpen.value = false;
  } catch (err: any) {
    error.value = err.message || t('auth.loginFailed');
  } finally {
    loading.value = false;
  }
};

watch(isLoggedIn, (loggedIn) => {
  if (!loggedIn) {
    return;
  }
  isOpen.value = false;
  error.value = '';
  loading.value = false;
});
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
        <DialogTitle>{{ $t('auth.login') }}</DialogTitle>
      </DialogHeader>
      <form
        @submit.prevent="handleSubmit"
        @focusin="handleFocusIn"
        class="grid gap-4 py-4"
      >
        <div class="grid gap-2">
          <Label for="username-or-email">
            {{ $t('auth.usernameOrEmail') }}
          </Label>
          <Input
            id="username-or-email"
            v-model="usernameOrEmail"
            :placeholder="$t('auth.usernameOrEmailPlaceholder')"
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
            :placeholder="$t('auth.passwordInputPlaceholder')"
            :disabled="loading"
            required
          />
        </div>

        <div v-if="error" class="text-sm text-destructive">
          {{ error }}
        </div>

        <Button type="submit" :disabled="loading" class="w-full">
          {{ loading ? $t('auth.loggingIn') : $t('auth.login') }}
        </Button>
      </form>
    </DialogContent>
  </Dialog>
</template>
