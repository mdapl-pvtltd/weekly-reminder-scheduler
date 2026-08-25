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
crons = ["*/5 * * * *"]
```

That means Cloudflare calls Retool every 5 minutes.

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

## Manual Trigger

The Worker also supports a manual `POST` request to the Worker URL. This runs the same Retool trigger as the cron handler.

Use this only for smoke testing.

## Operational Notes

- Do not trigger many Retool workflow runs in parallel.
- Keep the Worker as a single cron caller.
- Adjust `workflow_job_state.batch_size` in RetoolDB if Retool runs are taking too long.
- If Retool returns errors or times out, check Retool workflow logs first, then Cloudflare Worker logs.

