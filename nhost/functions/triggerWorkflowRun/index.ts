const GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL;
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

type WorkflowStep = {
  id: string;
  name: string;
  type: string;
  step_order: number;
  config: Record<string, unknown> | null;
};

type ApiResponse = {
  userId?: number;
  id?: number;
  title?: string;
  completed?: boolean;
  [key: string]: unknown;
};

function sendJson(res: any, data: Record<string, unknown>) {
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json(data);
}

async function graphql(
  query: string,
  variables: Record<string, unknown> = {}
) {
  if (!GRAPHQL_URL) {
    throw new Error("NHOST_GRAPHQL_URL is not configured");
  }

  if (!ADMIN_SECRET) {
    throw new Error("NHOST_ADMIN_SECRET is not configured");
  }

  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const text = await response.text();

  let result: any;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      `GraphQL returned invalid JSON. HTTP status: ${response.status}`
    );
  }

  if (result.errors) {
    throw new Error(
      result.errors[0]?.message || "GraphQL request failed"
    );
  }

  return result.data;
}

export default async function handler(req: any, res: any) {
  let runId: string | null = null;

  try {
    console.log("========== WORKFLOW START ==========");

    /*
     * -----------------------------------------
     * GET WORKFLOW ID
     * -----------------------------------------
     */

    const workflowId =
      req?.body?.input?.workflow_id ||
      req?.body?.workflow_id;

    console.log("WORKFLOW ID:", workflowId);

    if (!workflowId) {
      return sendJson(res, {
        run_id: "00000000-0000-0000-0000-000000000000",
        status: "failed",
        message: "workflow_id is required",
      });
    }

    /*
     * -----------------------------------------
     * GET WORKFLOW STEPS
     * -----------------------------------------
     */

    const stepsQuery = `
      query GetWorkflowSteps($workflow_id: uuid!) {
        workflow_steps(
          where: {
            workflow_id: {
              _eq: $workflow_id
            }
          }
          order_by: {
            step_order: asc
          }
        ) {
          id
          name
          type
          step_order
          config
        }
      }
    `;

    const stepsData = await graphql(stepsQuery, {
      workflow_id: workflowId,
    });

    console.log("WORKFLOW STEPS:", stepsData);

    const steps: WorkflowStep[] =
      stepsData?.workflow_steps || [];

    if (steps.length === 0) {
      return sendJson(res, {
        run_id: "00000000-0000-0000-0000-000000000000",
        status: "failed",
        message: "No workflow steps found",
      });
    }

    console.log(
      `Found ${steps.length} workflow steps`
    );

    /*
     * -----------------------------------------
     * CREATE WORKFLOW RUN
     * -----------------------------------------
     */

    const createRunMutation = `
      mutation CreateWorkflowRun(
        $workflow_id: uuid!
      ) {
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

    const runData = await graphql(
      createRunMutation,
      {
        workflow_id: workflowId,
      }
    );

    console.log("WORKFLOW RUN:", runData);

    const run =
      runData?.insert_workflow_runs_one;

    if (!run?.id) {
      throw new Error(
        "Could not create workflow run"
      );
    }

    runId = run.id;

    /*
     * -----------------------------------------
     * WORKFLOW STATE
     * -----------------------------------------
     */

    let workflowApiData:
      | ApiResponse
      | null = null;

    let aiMessage = "";

    /*
     * -----------------------------------------
     * EXECUTE STEPS IN ORDER
     * -----------------------------------------
     */

    for (const step of steps) {
      console.log(
        `Executing step ${step.step_order}: ${step.name} (${step.type})`
      );

      /*
       * ---------------------------------------
       * CREATE STEP RUN
       * ---------------------------------------
       */

      const createStepRunMutation = `
        mutation CreateStepRun(
          $workflow_run_id: uuid!
          $step_id: uuid!
          $status: String!
        ) {
          insert_step_runs_one(
            object: {
              workflow_run_id: $workflow_run_id
              step_id: $step_id
              status: $status
              attempt_count: 1
            }
          ) {
            id
            status
          }
        }
      `;

      let stepRunData: any = null;

      try {
        stepRunData = await graphql(
          createStepRunMutation,
          {
            workflow_run_id: run.id,
            step_id: step.id,
            status: "running",
          }
        );
      } catch (error) {
  console.error(
    "STEP_RUN INSERT ERROR:",
    JSON.stringify(error, null, 2)
  );

  throw error;
}

      const stepRunId =
        stepRunData?.insert_step_runs_one?.id;

      /*
       * ---------------------------------------
       * LLM CALL
       * ---------------------------------------
       */

      if (step.type === "llm_call") {
        console.log("LLM step reached");

        if (!GROQ_API_KEY) {
          throw new Error(
            "GROQ_API_KEY is not configured"
          );
        }

        const groqResponse = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization:
                `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model:
                "llama-3.1-8b-instant",
              messages: [
                {
                  role: "user",
                  content:
                    "You are an AI workflow assistant. Give a short helpful response confirming that the workflow AI step is working.",
                },
              ],
              temperature: 0.7,
            }),
          }
        );

        const groqResult =
          await groqResponse.json();

        console.log(
          "AI RESPONSE:",
          groqResult
        );

        if (!groqResponse.ok) {
          throw new Error(
            groqResult?.error?.message ||
              "Groq API request failed"
          );
        }

        aiMessage =
          groqResult?.choices?.[0]?.message
            ?.content || "";

        console.log(
          "AI MESSAGE:",
          aiMessage
        );

        if (stepRunId) {
          await graphql(
            `
              mutation CompleteStepRun(
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
              id: stepRunId,
              output: {
                message: aiMessage,
              },
            }
          );
        }
      }

      /*
       * ---------------------------------------
       * HTTP REQUEST
       * ---------------------------------------
       */

      else if (
        step.type === "http_request"
      ) {
        console.log(
          "HTTP request step reached"
        );

        let apiData:
          | ApiResponse
          | null = null;

        /*
         * First attempt
         */

        try {
          const response = await fetch(
            "https://jsonplaceholder.typicode.com/todos/1"
          );

          if (!response.ok) {
            throw new Error(
              `HTTP request failed with status ${response.status}`
            );
          }

          apiData =
            await response.json();
        } catch (firstError) {
          console.log(
            "HTTP request failed. Retrying...",
            firstError
          );

          /*
           * Retry once
           */

          const retryResponse =
            await fetch(
              "https://jsonplaceholder.typicode.com/todos/1"
            );

          if (!retryResponse.ok) {
            throw new Error(
              `HTTP request failed after retry with status ${retryResponse.status}`
            );
          }

          apiData =
            await retryResponse.json();
        }

        workflowApiData = apiData;

        console.log(
          "API RESPONSE:",
          workflowApiData
        );

        if (stepRunId) {
          await graphql(
            `
              mutation CompleteStepRun(
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
              id: stepRunId,
              output: workflowApiData,
            }
          );
        }
      }

      /*
       * ---------------------------------------
       * CONDITIONAL BRANCH
       * ---------------------------------------
       */

      else if (
        step.type ===
        "conditional_branch"
      ) {
        console.log(
          "Conditional branch step reached"
        );

        if (!workflowApiData) {
          throw new Error(
            "No API data available for conditional branch"
          );
        }

        const condition =
          workflowApiData.completed === true;

        let branchMessage = "";

        if (condition) {
          branchMessage =
            "API task is completed";

          console.log(
            "CONDITION RESULT: TRUE - API task is completed"
          );
        } else {
          branchMessage =
            "API task is not completed";

          console.log(
            "CONDITION RESULT: FALSE - API task is not completed"
          );
        }

        if (stepRunId) {
          await graphql(
            `
              mutation CompleteStepRun(
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
              id: stepRunId,
              output: {
                condition,
                message: branchMessage,
              },
            }
          );
        }
      }

      /*
       * ---------------------------------------
       * APPROVAL GATE
       * ---------------------------------------
       */

      else if (
        step.type ===
        "approval_gate"
      ) {
        console.log(
          "================================="
        );

        console.log(
          "APPROVAL GATE REACHED"
        );

        console.log(
          "RUN ID:",
          run.id
        );

        console.log(
          "STEP:",
          step.name
        );

        console.log(
          "PAUSING WORKFLOW NOW"
        );

        console.log(
          "================================="
        );

        /*
         * Mark approval step as paused
         */

        if (stepRunId) {
          await graphql(
            `
              mutation PauseStepRun(
                $id: uuid!
                $output: jsonb!
              ) {
                update_step_runs_by_pk(
                  pk_columns: { id: $id }
                  _set: {
                    status: "paused"
                    output: $output
                  }
                ) {
                  id
                  status
                }
              }
            `,
            {
              id: stepRunId,
              output: {
                message:
                  "Approval required before workflow can continue",
                approval_required: true,
              },
            }
          );

          console.log(
            "STEP RUN PAUSED:",
            stepRunId
          );
        }

        /*
         * Mark workflow run as paused
         */

        const pausedRun =
          await graphql(
            `
              mutation PauseWorkflowRun(
                $id: uuid!
              ) {
                update_workflow_runs_by_pk(
                  pk_columns: { id: $id }
                  _set: {
                    status: "paused"
                    message: "Workflow paused - awaiting approval"
                  }
                ) {
                  id
                  status
                  message
                }
              }
            `,
            {
              id: run.id,
            }
          );

        console.log(
          "WORKFLOW STATUS UPDATED:",
          pausedRun
        );

        console.log(
          "WORKFLOW PAUSED:",
          run.id
        );

        /*
         * VERY IMPORTANT:
         * Stop execution immediately.
         */

        return sendJson(res, {
          run_id: run.id,
          status: "paused",
          message:
            "Workflow paused - awaiting approval",
          paused_at_step: step.name,
          step_run_id:
            stepRunId || null,
        });
      }

      /*
       * ---------------------------------------
       * UNSUPPORTED STEP
       * ---------------------------------------
       */

      else {
        throw new Error(
          `Unsupported workflow step type: ${step.type}`
        );
      }

      console.log(
        `Step ${step.step_order} completed`
      );
    }

    /*
     * -----------------------------------------
     * ALL STEPS COMPLETED
     * -----------------------------------------
     */

    await graphql(
      `
        mutation CompleteWorkflowRun(
          $id: uuid!
        ) {
          update_workflow_runs_by_pk(
            pk_columns: { id: $id }
            _set: {
              status: "completed"
              message: "Workflow completed successfully"
            }
          ) {
            id
            status
            message
          }
        }
      `,
      {
        id: run.id,
      }
    );

    console.log(
      "WORKFLOW COMPLETED:",
      run.id
    );

    return sendJson(res, {
      run_id: run.id,
      status: "completed",
      message:
        "Workflow completed successfully",
      steps_found: steps.length,
      ai_message: aiMessage,
    });
  } catch (error: any) {
    console.error(
      "========== WORKFLOW ERROR =========="
    );

    console.error(error);

    /*
     * If a workflow run was already created,
     * mark it as failed in the database.
     */

    if (runId) {
      try {
        await graphql(
          `
            mutation FailWorkflowRun(
              $id: uuid!
              $message: String!
            ) {
              update_workflow_runs_by_pk(
                pk_columns: { id: $id }
                _set: {
                  status: "failed"
                  message: $message
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
            message:
              error?.message ||
              "Workflow execution failed",
          }
        );
      } catch (updateError) {
        console.error(
          "Could not update failed workflow run:",
          updateError
        );
      }
    }

    return sendJson(res, {
      run_id:
        runId ||
        "00000000-0000-0000-0000-000000000000",
      status: "failed",
      message:
        error?.message ||
        "Failed to execute workflow",
    });
  }
}

