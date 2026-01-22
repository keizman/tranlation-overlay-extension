<template>
  <div class="space-y-6">
    <!-- Speak Header -->
    <Card>
      <CardHeader>
        <CardTitle>
          <div class="flex items-center gap-3">
            <div
              class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"
            >
              <Mic class="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 class="text-2xl font-bold text-foreground">
                {{ $t('speakSettings.title') }}
              </h2>
              <p class="text-sm text-muted-foreground font-normal">
                {{ $t('speakSettings.description') }}
              </p>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
    </Card>

    <!-- Coming Soon Placeholder -->
    <Card>
      <CardContent class="py-12">
        <div class="text-center text-muted-foreground">
          <Mic class="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p class="text-lg font-medium">
            {{ $t('speakSettings.comingSoon') }}
          </p>
          <p class="text-sm mt-2">
            {{ $t('speakSettings.comingSoonDescription') }}
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { Mic } from 'lucide-vue-next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
</script>
