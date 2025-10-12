<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="q-pa-md" style="min-width: 300px">
      <q-card-section>
        <q-input
          v-model="name"
          label="Queue Name"
          autofocus
          :rules="[(val) => !!val || 'Name is required']"
        />
        <q-input
          v-model.number="tps"
          type="number"
          label="TPS"
          class="q-mt-md"
          :rules="[(val) => val > 0 || 'TPS must be > 0']"
        />
      </q-card-section>

      <q-card-actions align="right">
        <!-- Call the dialog plugin cancel method -->
        <q-btn flat label="Cancel" color="negative" @click="onDialogCancel" />
        <q-btn flat label="Create" color="primary" @click="onOKClick" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { useDialogPluginComponent } from 'quasar';

const props = defineProps({
  defaultName: { type: String, default: '' },
  defaultTps: { type: Number, default: 2000 },
});

// Must use these helpers from the plugin
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent();

defineEmits([
  // REQUIRED; need to specify some events that your
  // component will emit through useDialogPluginComponent()
  ...useDialogPluginComponent.emits,
]);

// Reactive state
const name = ref(props.defaultName);
const tps = ref(props.defaultTps);

function onOKClick() {
  if (!name.value.trim()) return;
  if (!tps.value || tps.value <= 0) return;

  // Resolve the dialog with payload
  onDialogOK({ name: name.value.trim(), tps: tps.value });
}
</script>
