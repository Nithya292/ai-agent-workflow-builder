import type { Request, Response } from "express";

const GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL;

async function graphql(query: string, variables: Record<string, unknown>) {
  if (!GRAPHQL_URL) {
    throw new Error("NHOST_GRAPHQL_URL is not configured");
  }

  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const text = await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid GraphQL response: ${text}`);
  }

  if (!response.ok) {
    throw new Error(
      data?.errors?.[0]?.message ||
        `GraphQL request failed with status ${response.status}`
    );
  }

  if (data?.errors?.length) {
    throw new Error(data.errors[0].message);
  }

  return data.data;
}

function sendJson(res: Response, body: unknown, status = 200) {
  return res.status(status).json(body);
}

export default async function approveStep(req: Request, res: Response) {
  try {
    console.log("========== APPROVE STEP ==========");

    if (req.method !== "POST") {
      return sendJson(
        res,
        {
          status: "failed",
          message: "Only POST requests are allowed",
        },
        405
      );
    }

    const { run_id } = req.body || {};

    if (!run_id) {
      return sendJson(
        res,
        {
          status: "failed",
          message: "run_id is required",
        },
        400
      );
    }

    console.log("Approving workflow run:", run_id);

    /*
     * Find the paused workflow run.
     */
    const workflowResult = await graphql(
      `
        query GetWorkflowRun($id: uuid!) {
          workflow_runs_by_pk(id: $id) {
            id
            status
            message
          }
        }
      `,
      {
        id: run_id,
      }
    );

    const workflowRun = workflowResult?.workflow_runs_by_pk;

    if (!workflowRun) {
      return sendJson(
        res,
        {
          status: "failed",
          message: "Workflow run not found",
          run_id,
        },
        404
      );
    }

    console.log("Current workflow status:", workflowRun.status);

    if (workflowRun.status !== "paused") {
      return sendJson(
        res,
        {
          status: "failed",
          message: `Workflow is not paused. Current status: ${workflowRun.status}`,
          run_id,
        },
        400
      );
    }

    /*
     * Mark workflow as approved.
     */
    await graphql(
      `
        mutation ApproveWorkflowRun($id: uuid!) {
          update_workflow_runs_by_pk(
            pk_columns: { id: $id }
            _set: {
              status: "approved"
              message: "Workflow approved"
            }
          ) {
            id
            status
            message
          }
        }
      `,
      {
        id: run_id,
      }
    );

    console.log("Workflow approved:", run_id);

    return sendJson(res, {
      run_id,
      status: "approved",
      message: "Workflow approved successfully",
    });
  } catch (error: any) {
    console.error("========== APPROVAL ERROR ==========");
    console.error(error);

    return sendJson(
      res,
      {
        run_id:
          req.body?.run_id ||
          "00000000-0000-0000-0000-000000000000",
        status: "failed",
        message:
          error?.message || "Failed to approve workflow",
      },
      500
    );
  }
}