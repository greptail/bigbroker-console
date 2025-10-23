export interface QueueApiResponse {
  name: string;
  metric?: {
    localQueues?: Array<{
      ref: string;
      localQueueDepth?: number;
      perSec?: number;
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
