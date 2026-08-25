# Cloudflare Configuration

This repo should be connected to Cloudflare Workers through the Cloudflare dashboard using GitHub integration. Local `wrangler` deployment is not required.

## Required Cloudflare Secrets

Set these variables/secrets in the Cloudflare Worker dashboard:

```text
RETOOL_WORKFLOW_URL
RETOOL_WORKFLOW_SECRET
```

Use the Retool workflow webhook URL for `RETOOL_WORKFLOW_URL`.

Use a private random secret for `RETOOL_WORKFLOW_SECRET`. The Retool workflow should validate either:

```text
Authorization: Bearer <secret>
```

or the JSON body field:

```json
{
  "secret": "<secret>"
}
```

## Cron Schedule

The current cron in `wrangler.toml` is:

```toml
crons = ["0 9 * * MON"]
```

Cloudflare Cron Triggers run on UTC time. `0 9 * * MON` means every Monday at 09:00 UTC, which is Monday 14:30 IST.

Retool decides whether to process a batch, skip because another batch is running, or skip because today's campaign is already done.

## Cloudflare Dashboard Setup

1. Open Cloudflare Dashboard.
2. Go to Workers & Pages.
3. Create a Worker connected to GitHub.
4. Select this repository:

   ```text
   mdapl-pvtltd/weekly-reminder-scheduler
   ```

5. Use the repository files as the source. No special build command is needed for this plain JavaScript Worker.
6. Add the required secrets:

   ```text
   RETOOL_WORKFLOW_URL
   RETOOL_WORKFLOW_SECRET
   ```

7. Confirm the cron trigger from `wrangler.toml` is recognized.
8. Deploy from `main`.

## Retool Expected Response

The Worker accepts any JSON or text response from Retool and logs it.

Typical Retool responses:

```json
{
  "status": "not_claimed",
  "reason": "already_running_or_done"
}
```

```json
{
  "status": "idle",
  "processed": 30
}
```

The exact response body is not critical for the first version. RetoolDB remains the source of truth.

## Manual Trigger Endpoint

The Worker supports manual one-time triggering through the Worker HTTP endpoint.

Send a `POST` request to the deployed Worker URL:

```text
POST https://<worker-name>.<account-subdomain>.workers.dev
```

A saved curl request is available at:

```text
requests/manual-trigger.curl
```

Set `WORKER_URL` before using it:

```sh
export WORKER_URL="https://<worker-name>.<account-subdomain>.workers.dev"
```

This runs the same Retool trigger as the scheduled cron handler, with:

```json
{
  "triggerSource": "manual",
  "maxTriggers": 20
}
```

The Worker calls Retool sequentially until Retool says there is no more work, or until `maxTriggers` is reached. The maximum allowed value is `20`.

The Worker does not bypass Retool's lock/state logic. If the Retool job is already running or already done for the campaign date, Retool should return:

```json
{
  "status": "not_claimed",
  "reason": "already_running_or_done"
}
```

Use this for smoke testing, retries after fixing an issue, or a one-time operational run.

## Retool Webhook Return Contract

For the Worker to stop before `maxTriggers`, Retool should have a webhook return block after `markJobSuccess`.

Recommended response body:

```json
{
  "status": "{{ markJobSuccess.data[0].status }}",
  "batchCount": "{{ getAllRegularCustomersNonCD.data.length }}",
  "lastDealerId": "{{ markJobSuccess.data[0].last_dealer_id }}",
  "completedAt": "{{ markJobSuccess.data[0].completed_at }}"
}
```

The Worker stops when Retool returns any of:

```json
{ "status": "done" }
```

```json
{ "status": "not_claimed", "reason": "already_running_or_done" }
```

```json
{ "done": true }
```

If Retool does not run a webhook return block, the Worker cannot know that all batches are exhausted and will keep triggering until `maxTriggers`.

## Operational Notes

- Do not trigger many Retool workflow runs in parallel.
- Keep the Worker as a single cron caller.
- Adjust `workflow_job_state.batch_size` in RetoolDB if Retool runs are taking too long.
- If Retool returns errors or times out, check Retool workflow logs first, then Cloudflare Worker logs.
