const JOB_NAME = "weekly_outstanding_invoices";

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(triggerRetool(env, "cron"));
  },

  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Use POST to trigger the Retool workflow.", {
        status: 405,
        headers: { Allow: "POST" },
      });
    }

    const result = await triggerRetool(env, "manual");
    return Response.json(result);
  },
};

async function triggerRetool(env, triggerSource) {
  validateEnv(env);

  const startedAt = new Date().toISOString();
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
      startedAt,
    }),
  });

  const responseText = await response.text();
  const body = parseResponseBody(responseText);

  const result = {
    ok: response.ok,
    status: response.status,
    triggerSource,
    startedAt,
    finishedAt: new Date().toISOString(),
    body,
  };

  if (response.ok) {
    console.log("Retool workflow completed", result);
  } else {
    console.error("Retool workflow failed", result);
  }

  return result;
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

