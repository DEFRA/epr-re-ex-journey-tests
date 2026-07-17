#!/bin/sh
set -eu

echo "[floci-init] Waiting for Floci to be ready..." >&2
until aws sqs list-queues >/dev/null 2>&1; do
  sleep 1
done
echo "[floci-init] Floci is ready" >&2

mk_bucket() {
  aws s3api create-bucket --bucket "$1" >/dev/null 2>&1 || true
}

mk_queue() {
  aws sqs create-queue --queue-name "$1" >/dev/null 2>&1 || true
}

echo "[floci-init] Creating buckets" >&2
mk_bucket cdp-uploader-quarantine
mk_bucket re-ex-summary-logs
mk_bucket re-ex-overseas-sites
mk_bucket re-ex-public-register
mk_bucket re-ex-form-uploads

echo "[floci-init] Creating queues" >&2
mk_queue cdp-clamav-results
mk_queue cdp-uploader-download-requests
aws sqs create-queue \
  --queue-name cdp-uploader-scan-results-callback.fifo \
  --attributes '{"FifoQueue":"true","ContentBasedDeduplication":"true"}' >/dev/null 2>&1 || true
mk_queue epr_backend_commands_dlq
aws sqs create-queue \
  --queue-name epr_backend_commands \
  --attributes '{"RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:eu-west-2:000000000000:epr_backend_commands_dlq\",\"maxReceiveCount\":\"3\"}"}' >/dev/null 2>&1 || true
mk_queue mock-clamav

echo "[floci-init] Configuring quarantine bucket notifications" >&2
aws s3api put-bucket-notification-configuration \
  --bucket cdp-uploader-quarantine \
  --notification-configuration '{"QueueConfigurations":[{"QueueArn":"arn:aws:sqs:eu-west-2:000000000000:mock-clamav","Events":["s3:ObjectCreated:*"]}]}'

# epr-backend-journey-tests also seeds ~65MB of summary-log xlsx fixtures into
# re-ex-summary-logs here (docker/scripts/floci/summarylogs/*.xlsx). Deliberately
# left out until this repo actually ports the summarylogs backend specs that
# consume them — no point shipping dead binary fixtures until something reads them.

echo "[floci-init] Done" >&2
