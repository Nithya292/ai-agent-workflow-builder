const GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL;

export default async function handler(req: any, res: any) {
  try {
    const workflowId = req.body?.input?.workflow_id;

    console.log("WORKFLOW ID:", workflowId);

    if (!workflowId) {
      return res.status(200).json({
        run_id: "00000000-0000-0000-0000-000000000000",
        status: "failed",
        message: "workflow_id is required",
      });
    }

    const mutation = `
      mutation CreateWorkflowRun($workflow_id: uuid!) {
        insert_workflow_runs_one(
          object: {
            workflow_id: $workflow_id
            status: "started"
            message: "Workflow started successfully"
          }
        ) {
          id
          status
          message
        }
      }
    `;

    const response = await fetch(GRAPHQL_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": process.env.NHOST_ADMIN_SECRET!,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          workflow_id: workflowId,
        },
      }),
    });

    const result = await response.json();

    console.log("GraphQL result:", result);

    if (result.errors) {
      console.error("GraphQL error:", result.errors);

      return res.status(200).json({
        run_id: "00000000-0000-0000-0000-000000000000",
        status: "failed",
        message: result.errors[0].message,
      });
    }

    const run = result.data.insert_workflow_runs_one;

    return res.status(200).json({
      run_id: run.id,
      status: run.status,
      message: run.message,
    });
  } catch (error: any) {
    console.error("Function error:", error);

    return res.status(200).json({
      run_id: "00000000-0000-0000-0000-000000000000",
      status: "failed",
      message: error.message || "Failed to start workflow",
    });
  }
}