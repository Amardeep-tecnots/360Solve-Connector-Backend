export const QUEUE_CONFIG = {
  tiers: {
    FREE: {
      queueName: 'workflow-exec-free',
      concurrency: 5,
      maxJobsPerHour: 100,
      maxQueueDepth: 50,
      priority: 'low',
    },
    STANDARD: {
      queueName: 'workflow-exec-standard',
      concurrency: 20,
      maxJobsPerHour: 1000,
      maxQueueDepth: 200,
      priority: 'medium',
    },
    ENTERPRISE: {
      queueName: 'workflow-exec-enterprise',
      concurrency: 100,
      maxJobsPerHour: 10000,
      maxQueueDepth: 1000,
      priority: 'high',
    },
  },
  retry: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5 seconds
    },
  },
  deadLetterQueue: {
    enabled: true,
    queueName: 'workflow-exec-dlq',
  },
  jobOptions: {
    removeOnComplete: {
      count: 100,
      age: 86400, // 24 hours
    },
    removeOnFail: {
      count: 500,
      age: 604800, // 7 days
    },
  },
};

export const getQueueForTier = (tier: string): string => {
  const config = QUEUE_CONFIG.tiers[tier as keyof typeof QUEUE_CONFIG.tiers];
  return config?.queueName || QUEUE_CONFIG.tiers.FREE.queueName;
};

export const getConcurrencyForTier = (tier: string): number => {
  const config = QUEUE_CONFIG.tiers[tier as keyof typeof QUEUE_CONFIG.tiers];
  return config?.concurrency || QUEUE_CONFIG.tiers.FREE.concurrency;
};
