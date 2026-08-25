const JOB_NAME = "weekly_outstanding_invoices";

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

    ctx.waitUntil(triggerRetool(env, "cron", { scheduledTime, cron: event.cron }));
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

    console.log("Manual trigger received", {
      requestId,
      jobName: JOB_NAME,
      triggerSource: "manual",
      userAgent: request.headers.get("user-agent"),
    });

    const result = await triggerRetool(env, "manual", { requestId });
    return Response.json(result);
  },
};

async function triggerRetool(env, triggerSource, context = {}) {
  validateEnv(env);

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
        runId,
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

function parseResponseBody(responseText) {
  if (!responseText) return null;

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

function validateEnv(env) {
  const missing = [];

  if (!env.RETOOL_WORKFLOW_URL) missing.push("RETOOL_WORKFLOW_URL");
  if (!env.RETOOL_WORKFLOW_SECRET) missing.push("RETOOL_WORKFLOW_SECRET");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
