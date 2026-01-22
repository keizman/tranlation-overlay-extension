<template>
  <div class="space-y-6">
    <!-- Write Header -->
    <Card>
      <CardHeader>
        <CardTitle>
          <div class="flex items-center gap-3">
            <div
              class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"
            >
              <PenTool class="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 class="text-2xl font-bold text-foreground">
                {{ $t('writeSettings.title') }}
              </h2>
              <p class="text-sm text-muted-foreground font-normal">
                {{ $t('writeSettings.description') }}
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
          <PenTool class="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p class="text-lg font-medium">
            {{ $t('writeSettings.comingSoon') }}
          </p>
          <p class="text-sm mt-2">
            {{ $t('writeSettings.comingSoonDescription') }}
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { PenTool } from 'lucide-vue-next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
</script>
