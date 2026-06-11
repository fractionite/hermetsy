import 'dotenv/config'

import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { processListingUpdateOperation } from './processors/update-listings.processor.js'
import { processRollbackOperation } from './processors/rollback.processor.js'

const connection = new IORedis(process.env.REDIS_URL || 'redis://redis:6379', {
  maxRetriesPerRequest: null
})

new Worker(
  'listing-updates',
  async (job) => {
    if (job.name === 'apply-operation') {
      await processListingUpdateOperation(job.data.operationId as string)
    }

    if (job.name === 'rollback-operation') {
      await processRollbackOperation(job.data.operationId as string)
    }
  },
  {
    connection,
    concurrency: 1
  }
)

console.log('Worker started')
