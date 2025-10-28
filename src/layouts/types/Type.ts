export interface QueueApiResponse {
  name: string;
  metric?: {
    localQueues?: Array<{
      ref: string;
      localQueueDepth?: number;
      perSec?: number;
      inFlight?: number;
      dequeue?: {
        requested?: number;
        accepted?: number;
        rejected?: number;
        delivery?: { accepted?: number; rejected?: number };
      };
      enqueue?: { requested?: number; submitted?: number; accepted?: number; rejected?: number };
      recovery?: { requested?: number; submitted?: number; accepted?: number; rejected?: number };
      consumers?: string[];
      node?: { host?: string; port?: number };
    }>;
    size?: number;
    perSec?: number;
    inFlight?: number;
    pendingToBeRecovered?: number;
    enqueue?: { requested?: number; submitted?: number; accepted?: number; rejected?: number };
    dequeue?: {
      requested?: number;
      accepted?: number;
      rejected?: number;
      delivery?: { accepted?: number; rejected?: number };
    };
    consumers?: string[];
    recovery?: { requested?: number; submitted?: number; accepted?: number; rejected?: number };
  };
}

export interface DeliveryInfo {
  error: number;
  accepted: number;
  perSec: number;
}
export interface DequeueInfo {
  totalRequested: number;
  totalAccepted: number;
  totalRejected: number;
  perSec: number;
  inFlight: number;
  node: string;
  delivery: DeliveryInfo;
}
export interface DequeueWithDelivery extends DequeueInfo {
  deliveryAccepted: number;
  deliveryError: number;
}
export interface QueueInfo {
  nodes: string[];
  size: number;
  pendingToBeRecovered: number;
  partition: string;
  perSec: number;
  inFlight: number;
  consumers: string[];
  enqueue: Array<{
    totalSubmitted: number;
    totalAccepted: number;
    totalRejected: number;
    node: string;
  }>;
  dequeue: Array<DequeueWithDelivery>;
  recovery: Array<{
    totalSubmitted: number;
    totalAccepted: number;
    totalRejected: number;
    node: string;
  }>;
}
export interface SummaryRow {
  queue: string;
  size: number;
  enqueue: number;
  dequeue: number;
  consumers?: number;
  tps?: string;
}

export interface QueueInstanceRecord {
  queue: string; // queue name
  partition: string; // queue partition
  file: string; // UUID as string
  recovered: boolean; // true/false
  delivered: boolean; // true/false
  paused: boolean; // true/false
  summary: string; // summary text
}

export interface LedgerRecord {
  queue: string; // queue name
  partition: string; // partition
  file: string; // UUID as string
  ledgerId: number; // ledger id
  processed: boolean; // true/false
  message: string; // message text
  totalRecordProcessed: number; // default 0
  totalEnqueueRecord: number; // default 0
  totalDequeueRecord: number; // default 0
  timeElapsed: number; // time elapsed
}
