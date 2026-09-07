# Weekly Reminder Scheduler

Cloudflare Worker cron scheduler for the Retool workflow:

`[v2] Weekly Outstanding Invoices Reminder`

The Worker is intentionally thin. It calls the Retool workflow webhook once per cron tick. Retool owns job locking, cursor state, batching, reminder sending, and completion state.

## How It Works

```text
Cloudflare Cron Trigger
  -> Worker scheduled handler
      -> POST Retool workflow webhook
          -> Retool claims lock
          -> Retool processes next batch
          -> Retool updates workflow_job_state
```

The Worker does not fan out requests and does not store the cursor.

## Configuration

See [CONFIGURATION.md](/Users/pranav/Documents/MDAPL/weekly-reminder-scheduler/CONFIGURATION.md).

## Manual Trigger

Use [requests/manual-trigger.curl](/Users/pranav/Documents/MDAPL/weekly-reminder-scheduler/requests/manual-trigger.curl) as a saved request template for Postman or curl.

Set `WORKER_URL` to the deployed Cloudflare Worker URL, then send a `POST` request. The Worker will call the Retool workflow with `triggerSource: "manual"` and Retool will still enforce its own lock/state checks.

Scheduled cron invocations run every 15 minutes on Monday from 14:30 to 18:15 IST and drain up to 2 Retool batches each time. Manual invocations can request up to 20 batches by passing `maxTriggers`.
