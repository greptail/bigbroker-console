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
    </q-page-container>
  </q-layout>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, computed, onUnmounted } from 'vue';
import { useQuasar, type QTableProps, Dialog } from 'quasar';
import axios from 'axios';
import CreateQueueDialog from 'components/CreateQueueDialog.vue';

// --- API Response Interfaces ---
import type {
  QueueApiResponse,
  QueueInfo,
  SummaryRow,
  DequeueWithDelivery,
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
    let intervalId: ReturnType<typeof setInterval> | undefined;

    // -------------------------------
    // Fetch Queues
    // -------------------------------
    const fetchQueues = async (): Promise<void> => {
      try {
        const res = await axios.get<QueueApiResponse[]>('/api/queue');
        const formatted: Record<string, QueueInfo> = {};

        res.data.forEach((item) => {
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
            partition: `${localQueues.length} nodes`,
            perSec: 0,
            consumers: metric.consumers ?? [],
            inFlight: metric.inFlight ?? 0, // Added inFlight property with a default value
            enqueue: [
              {
                totalSubmitted: enq.submitted ?? 0,
                totalAccepted: enq.accepted ?? 0,
                totalRejected: enq.rejected ?? 0,
                node: 'All',
              },
            ],
            recovery: [
              {
                totalSubmitted: rec.submitted ?? 0,
                totalAccepted: rec.accepted ?? 0,
                totalRejected: rec.rejected ?? 0,
                node: 'All',
              },
            ],
            dequeue: [
              {
                totalRequested: dq.requested ?? 0,
                totalAccepted: dq.accepted ?? 0,
                totalRejected: dq.rejected ?? 0,
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
              node: lq?.node ? `${lq.node.host}:${lq.node.port}` : 'All',
            });

            formatted[item.name]?.recovery.push({
              totalSubmitted: lq.recovery?.submitted ?? 0,
              totalAccepted: lq.recovery?.accepted ?? 0,
              totalRejected: lq.recovery?.rejected ?? 0,
              node: lq?.node ? `${lq.node.host}:${lq.node.port}` : 'All',
            });

            formatted[item.name]?.dequeue.push({
              totalRequested: lq.dequeue?.requested ?? 0,
              totalAccepted: lq.dequeue?.accepted ?? 0,
              totalRejected: lq.dequeue?.rejected ?? 0,
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
      } catch (err) {
        console.error(err);
        $q.notify({ type: 'negative', message: 'Failed to fetch queue details' });
      }
    };

    // -------------------------------
    // Lifecycle Hooks
    // -------------------------------
    onMounted(() => {
      void fetchQueues();
      intervalId = setInterval(() => {
        if (autoRefresh.value) void fetchQueues();
      }, 1000);
    });

    onUnmounted(() => {
      if (intervalId) clearInterval(intervalId);
    });

    // -------------------------------
    // Computed
    // -------------------------------
    const summaryColumns: QTableProps['columns'] = [
      { name: 'queue', label: 'Queue', field: 'queue', align: 'left' },
      { name: 'size', label: 'Size', field: 'size', align: 'right' },
      { name: 'consumers', label: 'Consumers', field: 'consumers', align: 'right' },
      { name: 'tps', label: 'Throughput per Sec', field: 'perSec', align: 'right' },
      { name: 'inFlight', label: 'In Flight', field: 'inFlight', align: 'right' },
      { name: 'enqueue', label: 'Enqueue', field: 'enqueue', align: 'right' },
      { name: 'dequeue', label: 'Dequeue', field: 'dequeue', align: 'right' },
    ];

    const summaryRows = computed<SummaryRow[]>(() =>
      Object.entries(queueDetails.value).map(([name, info]) => ({
        queue: name,
        size: info.size + (info.pendingToBeRecovered ?? 0),
        enqueue: info.enqueue[0]?.totalAccepted ?? 0,
        dequeue: info.dequeue[0]?.totalAccepted ?? 0,
        consumers: info.consumers.length,
        perSec: `${info.perSec}`,
        inFlight: `${info.inFlight}`, // Placeholder or remove this line if not needed
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
            const resDel = await axios.delete(`/api/queue/${queueName}`);
            if (resDel.status < 200 || resDel.status >= 300) throw new Error('Delete failed');

            const resFinalize = await axios.delete(`/api/queue/${queueName}/finalize`);
            if (resFinalize.status < 200 || resFinalize.status >= 300)
              throw new Error('Finalize failed');

            delete queueDetails.value[queueName];
            $q.notify({
              message: `Queue "${queueName}" deleted.`,
              color: 'positive',
              icon: 'check',
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(err);
            $q.notify({
              message: `Error deleting queue "${queueName}": ${msg}`,
              color: 'negative',
              icon: 'error',
            });
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
      { name: 'deliveryAccepted', label: 'Delivery Accepted', field: 'deliveryAccepted' },
      { name: 'deliveryError', label: 'Delivery Error', field: 'deliveryError' },
      { name: 'perSec', label: 'Throughput', field: 'perSec' },
      { name: 'inFlight', label: 'In Flight', field: 'inFlight' },
    ];

    return {
      summaryColumns,
      summaryRows,
      getQueue,
      enqueueColumns,
      dequeueColumns,
      recoveryColumns,
      expandedTabs,
      autoRefresh,
      deleteQueue,
      createQueue,
    };
  },
});
</script>
