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

    // 1. Get workflow steps
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

    const stepsResponse = await fetch(GRAPHQL_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": process.env.NHOST_ADMIN_SECRET!,
      },
      body: JSON.stringify({
        query: stepsQuery,
        variables: {
          workflow_id: workflowId,
        },
      }),
    });

    const stepsResult = await stepsResponse.json();

    console.log("WORKFLOW STEPS:", stepsResult);

    if (stepsResult.errors) {
      return res.status(200).json({
        run_id: "00000000-0000-0000-0000-000000000000",
        status: "failed",
        message: stepsResult.errors[0].message,
      });
    }

    const steps = stepsResult.data.workflow_steps;

    if (!steps || steps.length === 0) {
      return res.status(200).json({
        run_id: "00000000-0000-0000-0000-000000000000",
        status: "failed",
        message: "No workflow steps found",
      });
    }

    // 2. Create workflow run
    const createRunMutation = `
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

    const runResponse = await fetch(GRAPHQL_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": process.env.NHOST_ADMIN_SECRET!,
      },
      body: JSON.stringify({
        query: createRunMutation,
        variables: {
          workflow_id: workflowId,
        },
      }),
    });

    const runResult = await runResponse.json();

    console.log("WORKFLOW RUN:", runResult);

    if (runResult.errors) {
      return res.status(200).json({
        run_id: "00000000-0000-0000-0000-000000000000",
        status: "failed",
        message: runResult.errors[0].message,
      });
    }

    const run = runResult.data.insert_workflow_runs_one;

    // 3. Log each workflow step
    for (const step of steps) {
      console.log(
        `Executing step ${step.step_order}: ${step.name} (${step.type})`
      );

      if (step.type === "llm_call") {
  console.log("LLM step reached");

  const groqResponse = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
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

  const groqResult = await groqResponse.json();

  console.log("AI RESPONSE:", groqResult);

  if (!groqResponse.ok) {
    throw new Error(
      groqResult?.error?.message ||
        "Groq API request failed"
    );
  }

  const aiMessage =
    groqResult?.choices?.[0]?.message?.content;

  console.log("AI MESSAGE:", aiMessage);
}

      if (step.type === "http_request") {
  console.log("HTTP request step reached");

  const apiResponse = await fetch(
    "https://jsonplaceholder.typicode.com/todos/1"
  );

  const apiData = await apiResponse.json();

  console.log("API RESPONSE:", apiData);

  if (!apiResponse.ok) {
    throw new Error("HTTP request failed");
  }
}

      if (step.type === "conditional_branch") {
        console.log("Conditional branch step reached");
      }

      if (step.type === "approval_gate") {
        console.log("Approval gate step reached");
      }
    }

    return res.status(200).json({
      run_id: run.id,
      status: "started",
      message: `Workflow started successfully. ${steps.length} steps found.`,
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