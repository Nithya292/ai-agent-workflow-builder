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
     * GET INPUT
     * -----------------------------------------
     */

    const workflowId =
      req?.body?.input?.workflow_id ||
      req?.body?.workflow_id;

    const existingRunId =
      req?.body?.input?.run_id ||
      req?.body?.run_id;

    console.log("WORKFLOW ID:", workflowId);
    console.log("EXISTING RUN ID:", existingRunId);

    /*
     * -----------------------------------------
     * CREATE OR RESUME WORKFLOW RUN
     * -----------------------------------------
     */

    if (existingRunId) {
      /*
       * Resume an existing workflow run.
       */

      const existingRunData = await graphql(
        `
          query GetWorkflowRun($id: uuid!) {
            workflow_runs_by_pk(id: $id) {
              id
              workflow_id
              status
              message
            }
          }
        `,
        {
          id: existingRunId,
        }
      );

      const existingRun =
        existingRunData?.workflow_runs_by_pk;

      if (!existingRun) {
        throw new Error("Workflow run not found");
      }

      runId = existingRun.id;

      console.log(
        "RESUMING WORKFLOW RUN:",
        runId
      );

      /*
       * Change approved/paused run back to started.
       */

      await graphql(
        `
          mutation ResumeWorkflowRun(
            $id: uuid!
          ) {
            update_workflow_runs_by_pk(
              pk_columns: { id: $id }
              _set: {
                status: "started"
                message: "Workflow resumed after approval"
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
    } else {
      /*
       * New workflow execution.
       */

      if (!workflowId) {
        return sendJson(res, {
          run_id:
            "00000000-0000-0000-0000-000000000000",
          status: "failed",
          message: "workflow_id is required",
        });
      }

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

      const run =
        runData?.insert_workflow_runs_one;

      if (!run?.id) {
        throw new Error(
          "Could not create workflow run"
        );
      }

      runId = run.id;

      console.log(
        "NEW WORKFLOW RUN:",
        runId
      );
    }

    /*
     * -----------------------------------------
     * GET ACTUAL WORKFLOW ID
     * -----------------------------------------
     */

    let actualWorkflowId = workflowId;

    if (!actualWorkflowId && runId) {
      const runData = await graphql(
        `
          query GetWorkflowRunWorkflow(
            $id: uuid!
          ) {
            workflow_runs_by_pk(id: $id) {
              workflow_id
            }
          }
        `,
        {
          id: runId,
        }
      );

      actualWorkflowId =
        runData?.workflow_runs_by_pk?.workflow_id;
    }

    if (!actualWorkflowId) {
      throw new Error(
        "Could not determine workflow_id"
      );
    }

    /*
     * -----------------------------------------
     * GET WORKFLOW STEPS
     * -----------------------------------------
     */

    const stepsQuery = `
      query GetWorkflowSteps(
        $workflow_id: uuid!
      ) {
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

    const stepsData = await graphql(
      stepsQuery,
      {
        workflow_id: actualWorkflowId,
      }
    );

    const steps: WorkflowStep[] =
      stepsData?.workflow_steps || [];

    console.log(
      `Found ${steps.length} workflow steps`
    );

    if (steps.length === 0) {
      throw new Error(
        "No workflow steps found"
      );
    }

    /*
     * -----------------------------------------
     * GET EXISTING STEP RUNS
     * -----------------------------------------
     *
     * This is what makes RESUME work.
     */

    const stepRunsData = await graphql(
      `
        query GetStepRuns(
          $workflow_run_id: uuid!
        ) {
          step_runs(
            where: {
              workflow_run_id: {
                _eq: $workflow_run_id
              }
            }
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

    const existingStepRuns =
      stepRunsData?.step_runs || [];

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
     * EXECUTE STEPS
     * -----------------------------------------
     */

    for (const step of steps) {
      /*
       * ---------------------------------------
       * CHECK WHETHER THIS STEP ALREADY FINISHED
       * ---------------------------------------
       */

      const previousStepRun =
        existingStepRuns.find(
          (item: any) =>
            item.step_id === step.id
        );

      if (
        previousStepRun?.status ===
        "completed"
      ) {
        console.log(
          `Skipping completed step ${step.step_order}: ${step.name}`
        );

        continue;
      }

      console.log(
        `Executing step ${step.step_order}: ${step.name} (${step.type})`
      );

      /*
       * ---------------------------------------
       * CREATE STEP RUN
       * ---------------------------------------
       */

      let stepRunId =
        previousStepRun?.id || null;

      if (!stepRunId) {
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

        const stepRunData =
          await graphql(
            createStepRunMutation,
            {
              workflow_run_id: runId,
              step_id: step.id,
              status: "running",
            }
          );

        stepRunId =
          stepRunData
            ?.insert_step_runs_one?.id;
      } else {
        /*
         * If this was previously paused,
         * mark it as running again.
         */

        await graphql(
          `
            mutation ResumeStepRun(
              $id: uuid!
            ) {
              update_step_runs_by_pk(
                pk_columns: { id: $id }
                _set: {
                  status: "running"
                }
              ) {
                id
                status
              }
            }
          `,
          {
            id: stepRunId,
          }
        );
      }

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
              "Content-Type":
                "application/json",
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

        if (!groqResponse.ok) {
          throw new Error(
            groqResult?.error?.message ||
              "Groq API request failed"
          );
        }

        aiMessage =
          groqResult?.choices?.[0]
            ?.message?.content || "";

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

        /*
         * On resume, recover the API data
         * from the previous HTTP step if needed.
         */

        if (!workflowApiData) {
          const apiStep =
            steps.find(
              (item) =>
                item.type ===
                "http_request"
            );

          if (apiStep) {
            const apiStepRun =
              existingStepRuns.find(
                (item: any) =>
                  item.step_id ===
                  apiStep.id
              );

            if (apiStepRun?.id) {
              const outputData =
                await graphql(
                  `
                    query GetStepRun(
                      $id: uuid!
                    ) {
                      step_runs_by_pk(
                        id: $id
                      ) {
                        output
                      }
                    }
                  `,
                  {
                    id:
                      apiStepRun.id,
                  }
                );

              workflowApiData =
                outputData
                  ?.step_runs_by_pk
                  ?.output || null;
            }
          }
        }

        if (!workflowApiData) {
          throw new Error(
            "No API data available for conditional branch"
          );
        }

        const condition =
          workflowApiData.completed === true;

        const branchMessage = condition
          ? "API task is completed"
          : "API task is not completed";

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
          "APPROVAL GATE REACHED"
        );

        /*
         * Pause the step.
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
        }

        /*
         * Pause the workflow.
         */

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
            id: runId,
          }
        );

        return sendJson(res, {
          run_id: runId,
          status: "paused",
          message:
            "Workflow paused - awaiting approval",
          paused_at_step: step.name,
          step_run_id:
            stepRunId || null,
        });
      }

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
        id: runId,
      }
    );

    console.log(
      "WORKFLOW COMPLETED:",
      runId
    );

    return sendJson(res, {
      run_id: runId,
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
