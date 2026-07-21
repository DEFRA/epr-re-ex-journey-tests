import { request } from 'undici'

const sqsEndpoint = process.env.SQS_ENDPOINT ?? 'http://localhost:4566'

// Floci uses the SQS JSON API (X-Amz-Target headers), not the legacy query API.
const dlqQueueUrl = `${sqsEndpoint}/000000000000/epr_backend_commands_dlq`
const jsonHeaders = {
  'Content-Type': 'application/x-amz-json-1.0'
}

/**
 * Sends a message directly to the DLQ for test seeding.
 * @param {object} messageBody - The message body to send
 */
export async function sendMessageToDlq(messageBody) {
  const response = await request(sqsEndpoint, {
    method: 'POST',
    headers: {
      ...jsonHeaders,
      'X-Amz-Target': 'AmazonSQS.SendMessage'
    },
    body: JSON.stringify({
      QueueUrl: dlqQueueUrl,
      MessageBody: JSON.stringify(messageBody)
    })
  })

  if (response.statusCode !== 200) {
    const text = await response.body.text()
    throw new Error(
      `Failed to send message to DLQ: ${response.statusCode} ${text}`
    )
  }
}

/**
 * Purges all messages from the DLQ to ensure a clean state.
 */
export async function purgeDlq() {
  const response = await request(sqsEndpoint, {
    method: 'POST',
    headers: {
      ...jsonHeaders,
      'X-Amz-Target': 'AmazonSQS.PurgeQueue'
    },
    body: JSON.stringify({
      QueueUrl: dlqQueueUrl
    })
  })

  // PurgeQueue returns 200 on success; ignore 404 (queue empty / not found)
  if (response.statusCode !== 200 && response.statusCode !== 404) {
    const text = await response.body.text()
    throw new Error(`Failed to purge DLQ: ${response.statusCode} ${text}`)
  }
}
