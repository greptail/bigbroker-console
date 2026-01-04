<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-toolbar-title>Big Broker</q-toolbar-title>
        <div>BigBro v1.0</div>
      </q-toolbar>
    </q-header>

    <!-- Connection Status Banner -->
    <q-banner v-if="connectionStatus !== 'connected' && autoRefresh" class="connection-banner" :class="connectionStatus">
      <template v-slot:avatar>
        <q-icon name="warning" color="white" />
      </template>
      <span v-if="connectionStatus === 'disconnected'">Disconnected from broker. Attempting to reconnect...</span>
      <span v-else-if="connectionStatus === 'connecting'">Connecting to broker...</span>
    </q-banner>

    <q-page-container class="q-pa-md">
      <!-- Auto-refresh toggle -->
      <div class="row justify-end q-mb-md" style="padding-top: 20px">
        <q-toggle
          v-model="autoRefresh"
          label="Auto Refresh (1 sec)"
          color="primary"
          dense
          left-label
        />
      </div>

      <!-- Queues Table -->
      <div class="q-mt-lg">
        <q-table
          flat
          bordered
          title="Queues"
          :rows="summaryRows"
          :columns="summaryColumns"
          :pagination="{ rowsPerPage: 50 }"
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
            <q-tr :props="props" :class="{ 'blink-amber': props.row.underRecovery }">
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
                <template v-if="col.name === 'pendingLedgers'">
                  <q-btn
                    flat
                    dense
                    color="primary"
                    :label="col.value"
                    @click="viewLedgers(props.row.queue)"
                    v-if="props.row.pendingLedgers > 0"
                  />
                  <span v-else>{{ col.value }}</span>
                </template>
                <template v-else>
                  {{ col.value }}
                </template>
              </q-td>
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

            <!-- Expanded Tabs -->
            <q-tr v-show="props.expand" :props="props">
              <q-td colspan="100%">
                <q-tabs v-model="expandedTabs[props.row.queue]" dense class="text-bold">
                  <q-tab name="consumers" label="Consumers" />
                  <q-tab name="enqueue" label="Enqueue" />
                  <q-tab name="dequeue" label="Dequeue" />
                  <q-tab name="recovery" label="Recovery" />
                </q-tabs>

                <q-tab-panels v-model="expandedTabs[props.row.queue]" animated>
                  <q-tab-panel name="consumers">
                    <q-list bordered separator>
                      <template v-if="getQueue(props.row.queue).consumers.length">
                        <q-item v-for="c in getQueue(props.row.queue).consumers" :key="c">
                          <q-item-section>{{ c }}</q-item-section>
                        </q-item>
                      </template>
                      <template v-else>
                        <q-item>
                          <q-item-section>No consumers for this queue</q-item-section>
                        </q-item>
                      </template>
                    </q-list>
                  </q-tab-panel>

                  <q-tab-panel name="enqueue">
                    <q-table
                      flat
                      bordered
                      dense
                      :columns="enqueueColumns"
                      :rows="getQueue(props.row.queue).enqueue"
                      row-key="node"
                    />
                  </q-tab-panel>

                  <q-tab-panel name="dequeue">
                    <q-table
                      flat
                      bordered
                      dense
                      :columns="dequeueColumns"
                      :rows="getQueue(props.row.queue).dequeue"
                      row-key="totalRequested"
                    />
                  </q-tab-panel>

                  <q-tab-panel name="recovery">
                    <q-table
                      flat
                      bordered
                      dense
                      :columns="recoveryColumns"
                      :rows="getQueue(props.row.queue).recovery"
                      row-key="totalSubmitted"
                    />
                  </q-tab-panel>
                </q-tab-panels>
              </q-td>
            </q-tr>
          </template>
        </q-table>

        <CreateQueueDialog v-if="false" />
      </div>

      <!-- Pending Ledgers Modal -->
      <q-dialog v-model="ledgerModalOpen" full-width>
        <q-card>
          <q-card-section class="row items-center q-pb-none">
            <div class="text-h6">Pending Ledgers for: {{ currentQueueName }}</div>
            <q-space />
            <q-btn icon="close" flat round dense v-close-popup />
          </q-card-section>

          <q-card-section>
            <q-table
              flat
              bordered
              :rows="selectedQueueLedgers"
              :columns="ledgerColumns"
              :loading="isLoadingLedgers"
              row-key="ledgerId"
              :pagination="{ rowsPerPage: 15 }"
            >
              <template v-slot:loading>
                <q-inner-loading showing color="primary" />
              </template>
            </q-table>
          </q-card-section>
        </q-card>
      </q-dialog>
    </q-page-container>
  </q-layout>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, computed, onUnmounted, watch } from 'vue';
import { useQuasar, type QTableProps, Dialog } from 'quasar';
import axios from 'axios';
import CreateQueueDialog from 'components/CreateQueueDialog.vue';

// --- API Response Interfaces ---
import type {
  QueueApiResponse,
  QueueInfo,
  SummaryRow,
  DequeueWithDelivery,
  LedgerRecord,
} from 'src/layouts/types/Type';
// --- Local Interfaces ---

export default defineComponent({
  name: 'MainLayout',
  components: { CreateQueueDialog },
  setup() {
    const $q = useQuasar();
    const queueDetails = ref<Record<string, QueueInfo>>({});
    const expandedTabs = ref<Record<string, string>>({});
    const autoRefresh = ref(false);
    const connectionStatus = ref<'connected' | 'disconnected' | 'connecting'>('connected');

    // Ledger Modal State
    const ledgerModalOpen = ref(false);
    const selectedQueueLedgers = ref<LedgerRecord[]>([]);
    const isLoadingLedgers = ref(false);
    const currentQueueName = ref('');

    // -------------------------------
    // Fetch Queues
    // -------------------------------
    // -------------------------------
    // Format Queue Data
    // -------------------------------
    const formatQueueData = (data: QueueApiResponse[]) => {
      const formatted: Record<string, QueueInfo> = {};
      data.forEach((item) => {
        if (!expandedTabs.value[item.name]) {
          expandedTabs.value[item.name] = 'consumers';
        }
        const metric = item.metric ?? {};
        const dq = metric.dequeue ?? {};
        const enq = metric.enqueue ?? {};
        const rec = metric.recovery ?? {};
        const localQueues = metric.localQueues ?? [];

        formatted[item.name] = {
          nodes: localQueues.map((lq) => lq.ref),
          size: metric.size ?? 0,
          pendingToBeRecovered: metric.pendingToBeRecovered ?? 0,
          pendingLedgers: metric.pendingLeders ?? 0,
          underRecovery: metric.underRecovery ?? false,
          partition: `${localQueues.length} nodes`,
          perSec: metric.perSec ?? 0,
          producerPerSec: metric.producePerSec ?? 0,

          maxPerSec: metric.maxPerSec ?? 0,

          consumers: metric.consumers ?? [],
          inFlight: metric.inFlight ?? 0,
          enqueue: [
            {
              totalSubmitted: enq.submitted ?? 0,
              totalAccepted: enq.accepted ?? 0,
              totalRejected: enq.rejected ?? 0,
              producePerSec: item.metric?.producePerSec ?? 0,
              pipe: enq.pipe ?? 0,
              node: 'All',
            },
          ],
          recovery: [
            {
              totalSubmitted: rec.submitted ?? 0,
              totalAccepted: rec.accepted ?? 0,
              totalRejected: rec.rejected ?? 0,
              pipe: 0,
              node: 'All',
            },
          ],
          dequeue: [
            {
              totalRequested: dq.requested ?? 0,
              totalAccepted: dq.accepted ?? 0,
              totalRejected: dq.rejected ?? 0,
              pipe: dq.pipe ?? 0,
              node: 'All',
              perSec: item.metric?.perSec ?? 0,
              inFlight: item.metric?.inFlight ?? 0,
              delivery: {
                accepted: dq.delivery?.accepted ?? 0,
                error: dq.delivery?.rejected ?? 0,
                perSec: 0,
              },
              deliveryAccepted: dq.delivery?.accepted ?? 0,
              deliveryError: dq.delivery?.rejected ?? 0,
            },
          ],
        };

        item.metric?.localQueues?.forEach((lq) => {
          formatted[item.name]?.enqueue.push({
            totalSubmitted: lq.enqueue?.submitted ?? 0,
            totalAccepted: lq.enqueue?.accepted ?? 0,
            totalRejected: lq.enqueue?.rejected ?? 0,
            producePerSec: lq.producePerSec ?? 0,
            pipe: lq.enqueue?.pipe ?? 0,
            node: lq?.node ? `${lq.node.host}:${lq.node.port}` : 'All',
          });

          formatted[item.name]?.recovery.push({
            totalSubmitted: lq.recovery?.submitted ?? 0,
            totalAccepted: lq.recovery?.accepted ?? 0,
            totalRejected: lq.recovery?.rejected ?? 0,
            pipe: 0,
            node: lq?.node ? `${lq.node.host}:${lq.node.port}` : 'All',
          });

          formatted[item.name]?.dequeue.push({
            totalRequested: lq.dequeue?.requested ?? 0,
            totalAccepted: lq.dequeue?.accepted ?? 0,
            totalRejected: lq.dequeue?.rejected ?? 0,
            pipe: lq.dequeue?.pipe ?? 0,
            node: lq?.node ? `${lq.node.host}:${lq.node.port}` : 'All',
            perSec: lq.perSec ?? 0,
            inFlight: lq.inFlight ?? 0,
            delivery: {
              accepted: lq.dequeue?.delivery?.accepted ?? 0,
              error: lq.dequeue?.delivery?.rejected ?? 0,
              perSec: lq.perSec ?? 0,
            },
            deliveryAccepted: lq.dequeue?.delivery?.accepted ?? 0,
            deliveryError: lq.dequeue?.delivery?.rejected ?? 0,
          });
        });
      });

      const existingTabs = { ...expandedTabs.value };
      Object.keys(formatted).forEach((q) => {
        if (!existingTabs[q]) existingTabs[q] = 'nodes';
      });

      queueDetails.value = formatted;
      expandedTabs.value = existingTabs;
    };

    // -------------------------------
    // Fetch Queues
    // -------------------------------
    const fetchQueues = async (): Promise<void> => {
      try {
        const res = await axios.get<QueueApiResponse[]>('/api/queue');
        formatQueueData(res.data);
      } catch (err) {
        console.error(err);
        $q.notify({ type: 'negative', message: 'Failed to fetch queue details' });
      }
    };

    let queueEventSource: EventSource | null = null;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    const maxReconnectDelay = 30000; // Max 30 seconds between attempts
    const baseReconnectDelay = 2000; // Start with 2 seconds
    const heartbeatTimeout = 10000; // If no data for 10 seconds, consider disconnected

    const resetHeartbeat = () => {
      if (heartbeatTimer) {
        clearTimeout(heartbeatTimer);
      }
      heartbeatTimer = setTimeout(() => {
        console.warn('Heartbeat timeout - no data received for 10s');
        if (autoRefresh.value && queueEventSource) {
          // Force reconnection due to stale connection
          connectionStatus.value = 'disconnected';
          queueEventSource.close();
          queueEventSource = null;
          reconnectAttempts++;
          const delay = Math.min(baseReconnectDelay * Math.pow(1.5, reconnectAttempts - 1), maxReconnectDelay);
          console.log(`Heartbeat timeout - Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
          $q.notify({
            type: 'warning',
            message: `No data from broker. Reconnecting in ${Math.round(delay / 1000)}s...`,
            timeout: delay,
          });
          reconnectTimer = setTimeout(startQueueStream, delay);
        }
      }, heartbeatTimeout);
    };

    const stopQueueStream = () => {
      if (heartbeatTimer) {
        clearTimeout(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (queueEventSource) {
        queueEventSource.close();
        queueEventSource = null;
      }
    };

    const startQueueStream = () => {
      stopQueueStream(); // Close existing connection if any

      connectionStatus.value = 'connecting';
      queueEventSource = new EventSource('/api/queueStream');

      queueEventSource.onopen = () => {
        console.log('SSE connection established');
        reconnectAttempts = 0; // Reset attempts on successful connection
        connectionStatus.value = 'connected';
        resetHeartbeat(); // Start heartbeat monitoring
        $q.notify({
          type: 'positive',
          message: 'Connected to broker',
          timeout: 2000,
        });
      };

      queueEventSource.onmessage = (event) => {
        try {
          resetHeartbeat(); // Reset heartbeat on each message
          const res: QueueApiResponse[] = JSON.parse(event.data);
          formatQueueData(res);
        } catch (err) {
          console.error('Error parsing SSE data', err);
        }
      };

      queueEventSource.onerror = () => {
        console.error('Queue SSE connection error, readyState:', queueEventSource?.readyState);

        // Close the errored connection
        queueEventSource?.close();
        queueEventSource = null;
        connectionStatus.value = 'disconnected';

        // Clear heartbeat timer
        if (heartbeatTimer) {
          clearTimeout(heartbeatTimer);
          heartbeatTimer = null;
        }

        // Only reconnect if autoRefresh is still enabled
        if (autoRefresh.value) {
          reconnectAttempts++;
          // Calculate delay with exponential backoff
          const delay = Math.min(baseReconnectDelay * Math.pow(1.5, reconnectAttempts - 1), maxReconnectDelay);

          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

          $q.notify({
            type: 'warning',
            message: `Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`,
            timeout: delay,
          });

          reconnectTimer = setTimeout(startQueueStream, delay);
        }
      };
    };

    watch(autoRefresh, (newVal) => {
      if (newVal) {
        reconnectAttempts = 0;
        connectionStatus.value = 'connecting';
        startQueueStream();
      } else {
        stopQueueStream();
        connectionStatus.value = 'connected'; // Reset when auto-refresh is off
      }
    });

    // -------------------------------
    // Lifecycle Hooks
    // -------------------------------
    onMounted(() => {
      void fetchQueues();
    });

    onUnmounted(() => {
      stopQueueStream();
    });

    // -------------------------------
    // Computed
    // -------------------------------
    const summaryColumns: QTableProps['columns'] = [
      { name: 'queue', label: 'Queue', field: 'queue', align: 'left' },
      { name: 'size', label: 'Size', field: 'size', align: 'right' },
      { name: 'consumers', label: 'Consumers', field: 'consumers', align: 'right' },
      { name: 'tps', label: 'Produce per Sec', field: 'producePerSec', align: 'right' },
      { name: 'tps', label: 'Consume per Sec', field: 'perSec', align: 'right' },
      { name: 'inFlight', label: 'In Flight', field: 'inFlight', align: 'right' },
      { name: 'pendingLedgers', label: 'Pending Ledgers', field: 'pendingLedgers', align: 'right' },
       { name: 'enqueue', label: 'Enqueue', field: 'enqueue', align: 'right' },
      { name: 'dequeue', label: 'Dequeue', field: 'dequeue', align: 'right' },
    ];

    const summaryRows = computed<SummaryRow[]>(() =>
      Object.entries(queueDetails.value).map(([name, info]) => ({
        queue: name,
        size: info.size + (info.pendingToBeRecovered ?? 0),
        enqueue: (info.enqueue[0]?.totalAccepted ?? 0) + (info.enqueue[0]?.pipe ?? 0),
        dequeue: (info.dequeue[0]?.totalAccepted ?? 0) + (info.dequeue[0]?.pipe ?? 0),
        consumers: info.consumers.length,
        perSec: `${info.perSec}/${info.maxPerSec}`, // Display current and max TPS
        producePerSec: info.producerPerSec,
        pendingLedgers: info.pendingLedgers,
        inFlight: `${info.inFlight}`,
        underRecovery: info.underRecovery,
      })),
    );

    const getQueue = (queue: string): QueueInfo & { dequeueWithDelivery: DequeueWithDelivery } => {
      const info = queueDetails.value[queue];
      if (!info) throw new Error(`Queue details for '${queue}' are undefined`);
      return {
        ...info,
        dequeueWithDelivery: {
          totalRequested: info.dequeue[0]?.totalRequested ?? 0,
          totalAccepted: info.dequeue[0]?.totalAccepted ?? 0,
          totalRejected: info.dequeue[0]?.totalRejected ?? 0,
          pipe: info.dequeue[0]?.pipe ?? 0,
          node: info.dequeue[0]?.node ?? 'Unknown',
          delivery: info.dequeue[0]?.delivery ?? { accepted: 0, error: 0, perSec: 0 },
          deliveryAccepted: info.dequeue[0]?.delivery.accepted ?? 0,
          deliveryError: info.dequeue[0]?.delivery.error ?? 0,
          perSec: info.dequeue[0]?.perSec ?? 0,
          inFlight: info.dequeue[0]?.inFlight ?? 0,
        },
      };
    };

    // -------------------------------
    // View Ledgers
    // -------------------------------
    const viewLedgers = async (queueName: string): Promise<void> => {
      currentQueueName.value = queueName;
      ledgerModalOpen.value = true;
      isLoadingLedgers.value = true;
      selectedQueueLedgers.value = [];

      try {
        const res = await axios.get<LedgerRecord[]>(`/api/ledger?queue=${queueName}`);
        selectedQueueLedgers.value = res.data;
      } catch (err) {
        console.error(err);
        $q.notify({
          type: 'negative',
          message: `Failed to fetch ledgers for queue "${queueName}"`,
        });
      } finally {
        isLoadingLedgers.value = false;
      }
    };

    // -------------------------------
    // Delete Queue
    // -------------------------------
    const deleteQueue = (queueName: string): void => {
      $q.dialog({
        title: 'Confirm',
        message: `Are you sure you want to delete queue "${queueName}"?`,
        cancel: true,
        persistent: true,
      }).onOk(() => {
        void (async () => {
          try {
            $q.loading.show({ message: 'Deleting queue...' });

            const resDel = await axios.delete(`/api/queue/${queueName}`);
            if (resDel.status < 200 || resDel.status >= 300) {
              throw new Error('Delete failed');
            }

            // Wait 1 second before finalize call
            await new Promise((resolve) => setTimeout(resolve, 1000));

            $q.loading.show({ message: 'Finalizing...' });

            const resFinalize = await axios.delete(`/api/queue/${queueName}/finalize`);
            if (resFinalize.status < 200 || resFinalize.status >= 300) {
              throw new Error('Finalize failed');
            }

            delete queueDetails.value[queueName];

            $q.notify({
              message: `Queue "${queueName}" deleted.`,
              color: 'positive',
              icon: 'check',
            });
          } catch (err: unknown) {
            let msg = '';
            if (axios.isAxiosError(err)) {
              const backendMsg = err.response?.data
                ? JSON.stringify(err.response.data)
                : err.message;
              msg = backendMsg;
            } else {
              msg = err instanceof Error ? err.message : String(err);
            }

            console.error(err);

            $q.notify({
              message: `Error deleting queue "${queueName}": ${msg}`,
              color: 'negative',
              icon: 'error',
            });
          } finally {
            $q.loading.hide();
          }
        })();
      });
    };

    // -------------------------------
    // Create Queue
    // -------------------------------
    const createQueue = (): void => {
      Dialog.create({
        component: CreateQueueDialog,
        persistent: true,
      })
        .onOk((data: { name: string; tps: number }) => {
          void (async () => {
            try {
              const res = await axios.post('/api/queue', data);
              if (res.status < 200 || res.status >= 300) throw new Error('Create failed');
              await fetchQueues();
              console.log(`Queue "${data.name}" created successfully.`);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`Error creating queue "${data.name}": ${msg}`);
            }
          })();
        })
        .onCancel(() => console.log('Queue creation cancelled'))
        .onDismiss(() => console.log('Dialog closed'));
    };

    // -------------------------------
    // Table Columns
    // -------------------------------
    const enqueueColumns: QTableProps['columns'] = [
      { name: 'node', label: 'Node', field: 'node' },
      { name: 'totalSubmitted', label: 'Submitted', field: 'totalSubmitted' },
      { name: 'totalAccepted', label: 'Accepted', field: 'totalAccepted' },
      { name: 'pipe', label: 'Piped', field: 'pipe' },

      { name: 'producePerSec', label: 'Throughput', field: 'producePerSec' },

      { name: 'totalRejected', label: 'Rejected', field: 'totalRejected' },
    ];

    const recoveryColumns: QTableProps['columns'] = [
      { name: 'node', label: 'Node', field: 'node' },
      { name: 'totalSubmitted', label: 'Submitted', field: 'totalSubmitted' },
      { name: 'totalAccepted', label: 'Accepted', field: 'totalAccepted' },
      { name: 'totalRejected', label: 'Rejected', field: 'totalRejected' },
    ];

    const dequeueColumns: QTableProps['columns'] = [
      { name: 'node', label: 'Node', field: 'node' },
      { name: 'totalRequested', label: 'Requested', field: 'totalRequested' },
      { name: 'totalAccepted', label: 'Accepted', field: 'totalAccepted' },
      { name: 'totalRejected', label: 'Rejected', field: 'totalRejected' },
      { name: 'pipe', label: 'Piped', field: 'pipe' },
      { name: 'deliveryAccepted', label: 'Delivery Accepted', field: 'deliveryAccepted' },
      { name: 'deliveryError', label: 'Delivery Error', field: 'deliveryError' },
      { name: 'perSec', label: 'Throughput', field: 'perSec' },
      { name: 'inFlight', label: 'In Flight', field: 'inFlight' },
    ];

    const ledgerColumns: QTableProps['columns'] = [
      { name: 'ledgerId', label: 'Ledger ID', field: 'ledgerId', align: 'left', sortable: true },
      {
        name: 'processed',
        label: 'Processed',
        field: 'processed',
        align: 'center',
        format: (val: boolean) => (val ? 'Yes' : 'No'),
      },
      {
        name: 'totalEnqueueRecord',
        label: 'Enqueued',
        field: 'totalEnqueueRecord',
        align: 'right',
        sortable: true,
      },
      {
        name: 'totalDequeueRecord',
        label: 'Dequeued',
        field: 'totalDequeueRecord',
        align: 'right',
        sortable: true,
      },
      {
        name: 'totalRecordProcessed',
        label: 'Processed Recs',
        field: 'totalRecordProcessed',
        align: 'right',
        sortable: true,
      },
      {
        name: 'timeElapsed',
        label: 'Time (ms)',
        field: 'timeElapsed',
        align: 'right',
        sortable: true,
      },
    ];

    return {
      summaryColumns,
      summaryRows,
      getQueue,
      enqueueColumns,
      dequeueColumns,
      recoveryColumns,
      ledgerColumns,
      ledgerModalOpen,
      selectedQueueLedgers,
      isLoadingLedgers,
      currentQueueName,
      viewLedgers,
      expandedTabs,
      autoRefresh,
      connectionStatus,
      deleteQueue,
      createQueue,
    };
  },
});
</script>

<style scoped>
@keyframes blink-amber {
  0%, 100% {
    background-color: transparent;
  }
  50% {
    background-color: rgba(255, 191, 0, 0.3);
  }
}

.blink-amber {
  animation: blink-amber 1.5s ease-in-out infinite;
}

.connection-banner {
  position: sticky;
  top: 50px;
  z-index: 100;
}

.connection-banner.disconnected {
  background-color: #ff5252;
  color: white;
  animation: pulse-red 1.5s ease-in-out infinite;
}

.connection-banner.connecting {
  background-color: #fb8c00;
  color: white;
}

@keyframes pulse-red {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
