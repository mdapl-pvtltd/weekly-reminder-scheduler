const JOB_NAME = "weekly_outstanding_invoices";
const DEFAULT_CRON_MAX_TRIGGERS = 2;
const DEFAULT_MANUAL_MAX_TRIGGERS = 20;
const MAX_MANUAL_TRIGGERS = 20;
const DEFAULT_DELAY_BETWEEN_TRIGGERS_MS = 1000;

export default {
  async scheduled(event, env, ctx) {
    const scheduledTime = event.scheduledTime
      ? new Date(event.scheduledTime).toISOString()
      : null;

    console.log("Scheduled trigger received", {
      jobName: JOB_NAME,
      triggerSource: "cron",
      scheduledTime,
      cron: event.cron,
    });

    ctx.waitUntil(
      drainRetoolBatches(env, "cron", {
        scheduledTime,
        cron: event.cron,
        maxTriggers: DEFAULT_CRON_MAX_TRIGGERS,
      }),
    );
  },

  async fetch(request, env) {
    const requestId = crypto.randomUUID();

    if (request.method !== "POST") {
      console.warn("Rejected manual trigger with unsupported method", {
        requestId,
        method: request.method,
      });

      return new Response("Use POST to trigger the Retool workflow.", {
        status: 405,
        headers: { Allow: "POST" },
      });
    }

    const requestBody = await readJsonRequestBody(request);
    const maxTriggers = toPositiveInteger(
      requestBody?.maxTriggers,
      DEFAULT_MANUAL_MAX_TRIGGERS,
    );

    console.log("Manual trigger received", {
      requestId,
      jobName: JOB_NAME,
      triggerSource: "manual",
      userAgent: request.headers.get("user-agent"),
      maxTriggers,
    });

    const result = await drainRetoolBatches(env, "manual", {
      requestId,
      maxTriggers,
    });

    return Response.json(result);
  },
};

async function drainRetoolBatches(env, triggerSource, context = {}) {
  validateEnv(env);

  const drainId = crypto.randomUUID();
  const maxTriggers = toPositiveInteger(
    context.maxTriggers,
    triggerSource === "cron"
      ? DEFAULT_CRON_MAX_TRIGGERS
      : DEFAULT_MANUAL_MAX_TRIGGERS,
  );
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const results = [];

  console.log("Retool batch drain started", {
    drainId,
    jobName: JOB_NAME,
    triggerSource,
    maxTriggers,
    delayBetweenTriggersMs: DEFAULT_DELAY_BETWEEN_TRIGGERS_MS,
    startedAt,
    ...context,
  });

  for (let attempt = 1; attempt <= maxTriggers; attempt += 1) {
    const result = await triggerRetool(env, triggerSource, {
      ...context,
      drainId,
      attempt,
      maxTriggers,
    });

    results.push(result);

    if (!result.ok) {
      return finishDrain({
        drainId,
        triggerSource,
        startedAt,
        startedAtMs,
        results,
        reason: "retool_error",
      });
    }

    const stopReason = getStopReason(result.body);
    if (stopReason) {
      return finishDrain({
        drainId,
        triggerSource,
        startedAt,
        startedAtMs,
        results,
        reason: stopReason,
      });
    }

    if (attempt < maxTriggers) {
      await sleep(DEFAULT_DELAY_BETWEEN_TRIGGERS_MS);
    }
  }

  return finishDrain({
    drainId,
    triggerSource,
    startedAt,
    startedAtMs,
    results,
    reason: "max_triggers_reached",
  });
}

async function triggerRetool(env, triggerSource, context = {}) {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const workflowUrl = new URL(env.RETOOL_WORKFLOW_URL);

  console.log("Retool workflow trigger started", {
    runId,
    jobName: JOB_NAME,
    triggerSource,
    startedAt,
    workflowHost: workflowUrl.host,
    workflowPath: workflowUrl.pathname,
    ...context,
  });

  try {
    const response = await fetch(env.RETOOL_WORKFLOW_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RETOOL_WORKFLOW_SECRET}`,
      },
      body: JSON.stringify({
        jobName: JOB_NAME,
        secret: env.RETOOL_WORKFLOW_SECRET,
        triggerSource,
        drainId: context.drainId,
        runId,
        attempt: context.attempt,
        maxTriggers: context.maxTriggers,
        startedAt,
      }),
    });

    const responseText = await response.text();
    const body = parseResponseBody(responseText);
    const durationMs = Date.now() - startedAtMs;

    const result = {
      ok: response.ok,
      status: response.status,
      runId,
      attempt: context.attempt,
      maxTriggers: context.maxTriggers,
      jobName: JOB_NAME,
      triggerSource,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs,
      body,
    };

    const logPayload = {
      ...result,
      responseBodyType: typeof body,
      responseBodyLength: responseText.length,
    };

    if (response.ok) {
      console.log("Retool workflow trigger completed", logPayload);
    } else {
      console.error("Retool workflow trigger failed", logPayload);
    }

    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    const result = {
      ok: false,
      status: 0,
      runId,
      jobName: JOB_NAME,
      triggerSource,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs,
      errorName: error.name,
      errorMessage: error.message,
    };

    console.error("Retool workflow trigger threw an exception", result);
    return result;
  }
}

function finishDrain({
  drainId,
  triggerSource,
  startedAt,
  startedAtMs,
  results,
  reason,
}) {
  const summary = {
    ok: reason !== "retool_error",
    drainId,
    jobName: JOB_NAME,
    triggerSource,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    reason,
    triggerCount: results.length,
    results,
  };

  console.log("Retool batch drain finished", {
    ...summary,
    resultStatuses: results.map((result) => ({
      attempt: result.attempt,
      ok: result.ok,
      status: result.status,
      durationMs: result.durationMs,
      stopReason: getStopReason(result.body),
      bodyStatus: result.body?.status,
      bodyReason: result.body?.reason,
    })),
  });

  return summary;
}

function getStopReason(body) {
  if (!body || typeof body !== "object") return null;

  if (body.status === "done") return "done";
  if (body.status === "not_claimed") return body.reason || "not_claimed";
  if (body.reason === "already_running_or_done") return "already_running_or_done";
  if (body.done === true) return "done";

  return null;
}

function parseResponseBody(responseText) {
  if (!responseText) return null;

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

async function readJsonRequestBody(request) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await request.json();
  } catch (error) {
    console.warn("Manual trigger request body was not valid JSON", {
      errorName: error.name,
      errorMessage: error.message,
    });

    return null;
  }
}

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, MAX_MANUAL_TRIGGERS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateEnv(env) {
  const missing = [];

  if (!env.RETOOL_WORKFLOW_URL) missing.push("RETOOL_WORKFLOW_URL");
  if (!env.RETOOL_WORKFLOW_SECRET) missing.push("RETOOL_WORKFLOW_SECRET");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
