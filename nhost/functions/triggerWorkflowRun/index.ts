export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const body = await req.json();

    console.log(
      "triggerWorkflowRun received:",
      body
    );

    const workflowId =
      body?.input?.workflow_id;

    if (!workflowId) {
      return new Response(
        JSON.stringify({
          error: "workflow_id is required",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    /*
     * Temporary response so we can verify that
     * the Hasura Action → Nhost Function connection
     * is working.
     *
     * We will add the actual workflow execution logic
     * after the webhook connection is confirmed.
     */

    return new Response(
      JSON.stringify({
        run_id: workflowId,
        status: "started",
        message:
          "Workflow trigger received successfully.",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "triggerWorkflowRun error:",
      error
    );

    return new Response(
      JSON.stringify({
        error: "Invalid request",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}