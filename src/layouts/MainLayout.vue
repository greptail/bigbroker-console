<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-toolbar-title>Big Broker</q-toolbar-title>
        <div>BigBro v1.0</div>
      </q-toolbar>
    </q-header>

    <q-page-container class="q-pa-md">
      <!-- Auto-refresh toggle -->
      <!-- Auto-refresh toggle aligned to top right -->
      <div class="row justify-end q-mb-md" style="padding-top: 20px">
        <q-toggle
          v-model="autoRefresh"
          label="Auto Refresh (1 sec)"
          color="primary"
          dense
          left-label
        />
      </div>

      <!-- Shift table down a bit -->
      <div class="q-mt-lg">
        <q-table
          flat
          bordered
          title="Queues"
          :rows="summaryRows"
          :columns="summaryColumns"
          row-key="queue"
        >
          <template v-slot:top>
            <q-btn color="primary" label="Create Queue" @click="createQueue" />
          </template>
          <template v-slot:header="props">
            <q-tr :props="props">
              <q-th auto-width />
              <q-th v-for="col in props.cols" :key="col.name" :props="props">
                {{ col.label }}
              </q-th>
              <q-th auto-width />
            </q-tr>
          </template>

          <template v-slot:body="props">
            <q-tr :props="props">
              <q-td auto-width>
                <q-btn
                  size="sm"
                  color="accent"
                  round
                  dense
                  @click="props.expand = !props.expand"
                  :icon="props.expand ? 'remove' : 'add'"
                />
              </q-td>
              <q-td v-for="col in props.cols" :key="col.name" :props="props">
                {{ col.value }}
              </q-td>
              <!-- Delete button -->
              <q-td auto-width>
                <q-btn
                  size="sm"
                  color="negative"
                  icon="delete"
                  round
                  dense
                  @click="deleteQueue(props.row.queue)"
                />
              </q-td>
            </q-tr>

            <!-- Expanded row with tabs -->
            <q-tr v-show="props.expand" :props="props">
              <q-td colspan="100%">
                <q-tabs v-model="expandedTabs[props.row.queue]" dense class="text-bold">
                  <q-tab name="nodes" label="Nodes" />
                  <q-tab name="consumers" label="Consumers" />
                  <q-tab name="enqueue" label="Enqueue" />
                  <q-tab name="dequeue" label="Dequeue" />
                  <q-tab name="recovery" label="Recovery" />
                </q-tabs>

                <q-tab-panels v-model="expandedTabs[props.row.queue]" animated>
                  <!-- Nodes Tab -->
                  <q-tab-panel name="nodes">
                    <q-list bordered separator>
                      <q-item v-for="node in getQueue(props.row.queue).nodes" :key="node">
                        <q-item-section side>
                          <q-icon name="circle" size="10px" color="green" class="q-mr-sm" />
                        </q-item-section>
                        <q-item-section>{{ node }}</q-item-section>
                      </q-item>
                    </q-list>
                  </q-tab-panel>

                  <!-- Consumers Tab -->
                  <q-tab-panel name="consumers">
                    <q-list bordered separator>
                      <q-item v-for="c in getQueue(props.row.queue).consumers" :key="c">
                        <q-item-section>{{ c }}</q-item-section>
                      </q-item>
                    </q-list>
                  </q-tab-panel>

                  <!-- Enqueue Tab -->
                  <q-tab-panel name="enqueue">
                    <q-table
                      flat
                      bordered
                      dense
                      :columns="enqueueColumns"
                      :rows="[getQueue(props.row.queue).enqueue]"
                      row-key="totalSubmitted"
                    />
                  </q-tab-panel>

                  <!-- Dequeue Tab -->
                  <q-tab-panel name="dequeue">
                    <q-table
                      flat
                      bordered
                      dense
                      :columns="dequeueColumns"
                      :rows="[getQueue(props.row.queue).dequeueWithDelivery]"
                      row-key="totalRequested"
                    />
                  </q-tab-panel>

                  <!-- Recovery Tab -->
                  <q-tab-panel name="recovery">
                    <q-list bordered separator>
                      <q-item v-for="(v, k) in getQueue(props.row.queue).recovery" :key="k">
                        <q-item-section>{{ k }}: {{ JSON.stringify(v) }}</q-item-section>
                      </q-item>
                    </q-list>
                  </q-tab-panel>
                </q-tab-panels>
              </q-td>
            </q-tr>
          </template>
        </q-table>
        <CreateQueueDialog v-if="false"></CreateQueueDialog>
      </div>
    </q-page-container>
  </q-layout>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, computed, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import CreateQueueDialog from 'components/CreateQueueDialog.vue';
import axios from 'axios';
import { Dialog } from 'quasar';
interface DeliveryInfo {
  error: number;
  accepted: number;
  perSec: number;
}
interface DequeueInfo {
  totalRequested: number;
  totalAccepted: number;
  totalRejected: number;
  delivery: DeliveryInfo;
}
interface DequeueWithDelivery extends DequeueInfo {
  deliveryAccepted: number;
  deliveryError: number;
}
interface QueueInfo {
  nodes: string[];
  size: number;
  partition: string;
  tps: number;
  consumers: string[];
  enqueue: { totalSubmitted: number; totalAccepted: number; totalRejected: number };
  dequeue: DequeueInfo;
  recovery: Record<string, unknown>;
}
interface SummaryRow {
  queue: string;
  size: number;
  enqueue: number;
  dequeue: number;
  consumers?: number;
}

export default defineComponent({
  name: 'MainLayout',
  components: { CreateQueueDialog },
  setup() {
    const $q = useQuasar();
    const queueDetails = ref<Record<string, QueueInfo>>({});
    const expandedTabs = ref<Record<string, string>>({});
    const autoRefresh = ref(false);
    let intervalId: number | undefined;

    const fetchQueues = async () => {
      try {
        const res = await axios.get('/api/queue');
        const existingTabs = { ...expandedTabs.value };
        queueDetails.value = res.data;
        Object.keys(res.data).forEach((q) => {
          if (!existingTabs[q]) existingTabs[q] = 'nodes';
        });
        expandedTabs.value = existingTabs;
      } catch (err) {
        console.error(err);
        $q.notify({ type: 'negative', message: 'Failed to fetch queue details' });
      }
    };

    onMounted(() => {
      void fetchQueues();

      // Auto-refresh loop
      intervalId = setInterval(() => {
        if (autoRefresh.value) {
          void fetchQueues();
        }
      }, 1000);
    });

    onUnmounted(() => {
      if (intervalId) clearInterval(intervalId);
    });

    const queueNames = computed(() => Object.keys(queueDetails.value));
    const summaryColumns = [
      { name: 'queue', label: 'Queue', field: 'queue', align: 'left' },
      { name: 'size', label: 'Size', field: 'size', align: 'right' },
      { name: 'consumers', label: 'Consumers', field: 'consumers', align: 'right' },
      { name: 'tps', label: 'Throuput per Sec', field: 'tps', align: 'right' },
      { name: 'enqueue', label: 'Enqueue', field: 'enqueue', align: 'right' },
      { name: 'dequeue', label: 'Dequeue', field: 'dequeue', align: 'right' },
    ];
    const summaryRows = computed<SummaryRow[]>(() =>
      queueNames.value.map((name) => {
        const info = queueDetails.value[name];
        return {
          queue: name,
          size: info?.size ?? 0,
          enqueue: info?.enqueue.totalAccepted ?? 0,
          dequeue: info?.dequeue.totalAccepted ?? 0,
          consumers: info?.consumers.length ?? 0,
          tps: `${info?.dequeue.delivery.perSec ?? 0} / ${info?.tps ?? 0}`,
        };
      }),
    );

    const getQueue = (queue: string): QueueInfo & { dequeueWithDelivery: DequeueWithDelivery } => {
      const info = queueDetails.value[queue];
      if (!info) {
        throw new Error(`Queue details for '${queue}' are undefined`);
      }
      return {
        ...info,
        dequeueWithDelivery: {
          ...info.dequeue,
          deliveryAccepted: info.dequeue.delivery.accepted,
          deliveryError: info.dequeue.delivery.error,
        },
      };
    };

    // -------------------------------
    // Delete queue
    // -------------------------------
    const deleteQueue = (queueName: string) => {
      $q.dialog({
        title: 'Confirm',
        message: `Are you sure you want to delete queue "${queueName}"?`,
        cancel: true,
        persistent: true,
      }).onOk(() => {
        void (async () => {
          try {
            const deletedResponse = await axios.delete(`/api/queue/${queueName}`);
            if (deletedResponse.status < 200 || deletedResponse.status >= 300) {
              throw new Error(`Failed to delete queue "${queueName}"`);
            }

            const finalizeResponse = await axios.delete(`/api/queue/${queueName}/finalize`);
            if (finalizeResponse.status < 200 || finalizeResponse.status >= 300) {
              throw new Error(`Failed to finalize deletion of queue "${queueName}"`);
            }

            // Remove from reactive state
            delete queueDetails.value[queueName];

            $q.notify({
              message: `Queue "${queueName}" deleted.`,
              color: 'positive',
              icon: 'check',
            });
          } catch (err: unknown) {
            console.error(err);
            const message = err instanceof Error ? err.message : String(err);
            $q.notify({
              message: `Error deleting queue "${queueName}": ${message}`,
              color: 'negative',
              icon: 'error',
            });
          }
        })();
      });
    };
    const createQueue = () => {
      Dialog.create({
        component: CreateQueueDialog,
        persistent: true,
      })
        .onOk((data: { name: string; tps: number }) => {
          // Wrap async logic in void IIFE to satisfy ESLint
          void (async () => {
            try {
              const response = await axios.post('/api/queue', data);

              if (response.status < 200 || response.status >= 300) {
                throw new Error(`Failed to create queue "${data.name}"`);
              }

              // Update reactive state
              await fetchQueues();
              console.log(`Queue "${data.name}" created successfully.`);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              console.error(`Error creating queue "${data.name}": ${message}`);
            }
          })();
        })
        .onCancel(() => {
          console.log('Queue creation cancelled');
        })
        .onDismiss(() => {
          console.log('Dialog closed (OK or Cancel)');
        });
    };
    const enqueueColumns = [
      { name: 'totalSubmitted', label: 'Submitted', field: 'totalSubmitted' },
      { name: 'totalAccepted', label: 'Accepted', field: 'totalAccepted' },
      { name: 'totalRejected', label: 'Rejected', field: 'totalRejected' },
    ];
    const dequeueColumns = [
      { name: 'totalRequested', label: 'Requested', field: 'totalRequested' },
      { name: 'totalAccepted', label: 'Accepted', field: 'totalAccepted' },
      { name: 'totalRejected', label: 'Rejected', field: 'totalRejected' },
      { name: 'deliveryAccepted', label: 'Delivery Accepted', field: 'deliveryAccepted' },
      { name: 'deliveryError', label: 'Delivery Error', field: 'deliveryError' },
    ];

    return {
      summaryColumns,
      summaryRows,
      getQueue,
      enqueueColumns,
      dequeueColumns,
      expandedTabs,
      autoRefresh,
      deleteQueue,
      createQueue,
    };
  },
});
</script>
