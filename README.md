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

