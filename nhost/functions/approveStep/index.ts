const GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL;
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET;
const FUNCTIONS_URL = process.env.NHOST_FUNCTIONS_URL;

async function graphql(
  query: string,
  variables: Record<string, unknown> = {}
) {
  if (!GRAPHQL_URL) {
    throw new Error(
      "NHOST_GRAPHQL_URL is not configured"
    );
  }

  if (!ADMIN_SECRET) {
    throw new Error(
      "NHOST_ADMIN_SECRET is not configured"
    );
  }

  const response = await fetch(
    GRAPHQL_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret":
          ADMIN_SECRET,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    }
  );

  const text = await response.text();

  let result: any;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid GraphQL response: ${text}`
    );
  }

  if (result.errors?.length) {
    throw new Error(
      result.errors[0]?.message ||
        "GraphQL request failed"
    );
  }

  return result.data;
}

function sendJson(
  res: any,
  data: Record<string, unknown>,
  status = 200
) {
  res.setHeader(
    "Content-Type",
    "application/json"
  );

  return res.status(status).json(data);
}

export default async function approveStep(
  req: any,
  res: any
) {
  try {
    console.log(
      "========== APPROVE STEP =========="
    );

    if (req.method !== "POST") {
      return sendJson(
        res,
        {
          status: "failed",
          message:
            "Only POST requests are allowed",
        },
        405
      );
    }

    const runId =
      req?.body?.input?.run_id ||
      req?.body?.run_id;

    if (!runId) {
      return sendJson(
        res,
        {
          status: "failed",
          message: "run_id is required",
        },
        400
      );
    }

    console.log(
      "APPROVING RUN:",
      runId
    );

    /*
     * -----------------------------------------
     * GET WORKFLOW RUN
     * -----------------------------------------
     */

    const runData = await graphql(
      `
        query GetWorkflowRun(
          $id: uuid!
        ) {
          workflow_runs_by_pk(id: $id) {
            id
            workflow_id
            status
          }
        }
      `,
      {
        id: runId,
      }
    );

    const run =
      runData?.workflow_runs_by_pk;

    if (!run) {
      return sendJson(
        res,
        {
          status: "failed",
          message:
            "Workflow run not found",
          run_id: runId,
        },
        404
      );
    }

    if (run.status !== "paused") {
      return sendJson(
        res,
        {
          status: "failed",
          message:
            `Workflow is not paused. Current status: ${run.status}`,
          run_id: runId,
        },
        400
      );
    }

    /*
     * -----------------------------------------
     * FIND PAUSED APPROVAL STEP
     * -----------------------------------------
     */

    const pausedStepData =
      await graphql(
        `
          query GetPausedStepRun(
            $workflow_run_id: uuid!
          ) {
            step_runs(
              where: {
                workflow_run_id: {
                  _eq: $workflow_run_id
                }
                status: {
                  _eq: "paused"
                }
              }
              limit: 1
            ) {
              id
              step_id
              status
            }
          }
        `,
        {
          workflow_run_id: runId,
        }
      );

    const pausedStep =
      pausedStepData?.step_runs?.[0];

    if (!pausedStep) {
      return sendJson(
        res,
        {
          status: "failed",
          message:
            "No paused approval step found",
          run_id: runId,
        },
        400
      );
    }

    /*
     * -----------------------------------------
     * COMPLETE APPROVAL STEP
     * -----------------------------------------
     */

    await graphql(
      `
        mutation ApproveStep(
          $id: uuid!
          $output: jsonb!
        ) {
          update_step_runs_by_pk(
            pk_columns: { id: $id }
            _set: {
              status: "completed"
              output: $output
            }
          ) {
            id
            status
          }
        }
      `,
      {
        id: pausedStep.id,
        output: {
          approved: true,
          message:
            "Approval granted. Workflow resumed.",
        },
      }
    );

    /*
     * -----------------------------------------
     * MARK WORKFLOW AS APPROVED
     * -----------------------------------------
     */

    await graphql(
      `
        mutation ApproveWorkflow(
          $id: uuid!
        ) {
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
        id: runId,
      }
    );

    console.log(
      "APPROVAL SAVED:",
      runId
    );

    /*
     * -----------------------------------------
     * RESUME WORKFLOW
     * -----------------------------------------
     */

    if (!FUNCTIONS_URL) {
      throw new Error(
        "NHOST_FUNCTIONS_URL is not configured"
      );
    }

    const resumeUrl =
      `${FUNCTIONS_URL}/triggerWorkflowRun`;

    console.log(
      "RESUMING WORKFLOW:",
      resumeUrl
    );

    const resumeResponse =
      await fetch(resumeUrl, {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          run_id: runId,
          workflow_id:
            run.workflow_id,
        }),
      });

    const resumeText =
      await resumeResponse.text();

    let resumeResult: any;

    try {
      resumeResult =
        JSON.parse(resumeText);
    } catch {
      resumeResult = {
        status:
          resumeResponse.status,
        message: resumeText,
      };
    }

    console.log(
      "RESUME RESULT:",
      resumeResult
    );

    if (!resumeResponse.ok) {
      throw new Error(
        resumeResult?.message ||
          "Workflow resume failed"
      );
    }

    return sendJson(res, {
      run_id: runId,
      status:
        resumeResult?.status ||
        "completed",
      message:
        resumeResult?.message ||
        "Workflow approved and resumed",
    });
  } catch (error: any) {
    console.error(
      "========== APPROVAL ERROR =========="
    );

    console.error(error);

    return sendJson(
      res,
      {
        run_id:
          req?.body?.input?.run_id ||
          req?.body?.run_id ||
          null,
        status: "failed",
        message:
          error?.message ||
          "Failed to approve workflow",
      },
      500
    );
  }
}