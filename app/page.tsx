"use client";

import { gql } from "@apollo/client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";

const WORKFLOW_ID =
  "ba8cf45f-2ec6-4751-b403-0261c6f7fbe9";

/* -----------------------------------------
   GRAPHQL QUERY
----------------------------------------- */

const GET_WORKFLOW_STEPS = gql`
  query GetWorkflowSteps {
    workflow_steps(
      where: {
        workflow_id: {
          _eq: "ba8cf45f-2ec6-4751-b403-0261c6f7fbe9"
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

/* -----------------------------------------
   TRIGGER WORKFLOW
----------------------------------------- */

const TRIGGER_WORKFLOW = gql`
  mutation TriggerWorkflowRun($workflow_id: uuid!) {
    triggerWorkflowRun(workflow_id: $workflow_id) {
      run_id
      status
      message
    }
  }
`;

/* -----------------------------------------
   APPROVE WORKFLOW
----------------------------------------- */

const APPROVE_WORKFLOW = async (runId: string) => {
  const response = await fetch(
    "https://rpwtchgtqyirntusolfc.functions.ap-south-1.nhost.run/v1/approveStep",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_id: runId,
      }),
    }
  );

  const text = await response.text();

  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(text || "Approval request failed");
  }

  if (!response.ok) {
    throw new Error(
      result?.message || "Approval request failed"
    );
  }

  return result;
};

/* -----------------------------------------
   TYPES
----------------------------------------- */

type WorkflowStep = {
  id?: string;
  name: string;
  type: string;
  step_order?: number;
  config?: Record<string, unknown>;
};

type WorkflowRun = {
  id: string;
  status: string;
  message: string;
};

type TriggerWorkflowResponse = {
  triggerWorkflowRun: {
    run_id: string;
    status: string;
    message: string;
  };
};

type TriggerWorkflowVariables = {
  workflow_id: string;
};

/* -----------------------------------------
   STEP TYPES
----------------------------------------- */

const stepTypes = [
  "llm_call",
  "http_request",
  "conditional_branch",
  "approval_gate",
];

/* -----------------------------------------
   MAIN COMPONENT
----------------------------------------- */

export default function Home() {
  const [workflowName, setWorkflowName] =
    useState("AI Demo Workflow");

  const [steps, setSteps] =
    useState<WorkflowStep[]>([]);

  const [latestRun, setLatestRun] =
    useState<WorkflowRun | null>(null);

  const [runSteps, setRunSteps] =
    useState<string[]>([]);

  const [approving, setApproving] =
    useState(false);

  /* -----------------------------------------
     LOAD STEPS
  ----------------------------------------- */

  const {
    data,
    loading: stepsLoading,
    error: stepsError,
  } = useQuery<{
    workflow_steps: WorkflowStep[];
  }>(GET_WORKFLOW_STEPS);

  /* -----------------------------------------
     TRIGGER MUTATION
  ----------------------------------------- */

  const [
    triggerWorkflow,
    { loading: workflowLoading },
  ] = useMutation<
    TriggerWorkflowResponse,
    TriggerWorkflowVariables
  >(TRIGGER_WORKFLOW);

  /* -----------------------------------------
     LOAD DATABASE STEPS
  ----------------------------------------- */

  useEffect(() => {
    if (data?.workflow_steps) {
      setSteps(data.workflow_steps);
    }
  }, [data]);

  /* -----------------------------------------
     ADD STEP
  ----------------------------------------- */

  function addStep() {
    const newStep: WorkflowStep = {
      name: `New Step ${steps.length + 1}`,
      type: "llm_call",
      step_order: steps.length + 1,
      config: {},
    };

    setSteps([...steps, newStep]);
  }

  /* -----------------------------------------
     REMOVE STEP
  ----------------------------------------- */

  function removeStep(index: number) {
    const updatedSteps = steps
      .filter((_, i) => i !== index)
      .map((step, i) => ({
        ...step,
        step_order: i + 1,
      }));

    setSteps(updatedSteps);
  }

  /* -----------------------------------------
     UPDATE STEP NAME
  ----------------------------------------- */

  function updateStepName(
    index: number,
    name: string
  ) {
    const updatedSteps = [...steps];

    updatedSteps[index] = {
      ...updatedSteps[index],
      name,
    };

    setSteps(updatedSteps);
  }

  /* -----------------------------------------
     UPDATE STEP TYPE
  ----------------------------------------- */

  function updateStepType(
    index: number,
    type: string
  ) {
    const updatedSteps = [...steps];

    updatedSteps[index] = {
      ...updatedSteps[index],
      type,
    };

    setSteps(updatedSteps);
  }

  /* -----------------------------------------
     RUN WORKFLOW
  ----------------------------------------- */

  async function runWorkflow() {
    try {
      const result = await triggerWorkflow({
        variables: {
          workflow_id: WORKFLOW_ID,
        },
      });

      console.log(
        "Workflow result:",
        result.data
      );

      const workflowResult =
        result.data?.triggerWorkflowRun;

      if (!workflowResult) {
        throw new Error(
          "Workflow did not return a result"
        );
      }

      setLatestRun({
        id: workflowResult.run_id,
        status: workflowResult.status,
        message: workflowResult.message,
      });

      setRunSteps([
        "Generate AI Response",
        "Get API Data",
        "Check AI Response",
        "Approval Required",
      ]);

      alert(
        workflowResult.message ||
          "Workflow started successfully."
      );
    } catch (error) {
      console.error(
        "Workflow error:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Workflow could not be started."
      );
    }
  }

  /* -----------------------------------------
     APPROVE WORKFLOW
  ----------------------------------------- */

  async function approveWorkflow() {
    if (!latestRun?.id) {
      alert("No workflow run found.");
      return;
    }

    try {
      setApproving(true);

      console.log(
        "Approving workflow:",
        latestRun.id
      );

      const result =
        await APPROVE_WORKFLOW(
          latestRun.id
        );

      console.log(
        "Approval result:",
        result
      );

      setLatestRun((current) =>
        current
          ? {
              ...current,
              status:
                result.status ||
                "completed",
              message:
                result.message ||
                "Workflow approved and resumed",
            }
          : current
      );

      alert(
        result.message ||
          "Workflow approved successfully."
      );
    } catch (error) {
      console.error(
        "Approval error:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Approval failed."
      );
    } finally {
      setApproving(false);
    }
  }

  /* -----------------------------------------
     LOADING
  ----------------------------------------- */

  if (stepsLoading) {
    return (
      <main className="min-h-screen bg-gray-100 p-8">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl bg-white p-8 shadow">
            <p className="text-gray-600">
              Loading workflow steps...
            </p>
          </div>
        </div>
      </main>
    );
  }

  /* -----------------------------------------
     ERROR
  ----------------------------------------- */

  if (stepsError) {
    return (
      <main className="min-h-screen bg-gray-100 p-8">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl bg-white p-8 shadow">
            <h1 className="mb-4 text-2xl font-bold text-red-600">
              Error loading workflow steps
            </h1>

            <div className="rounded-lg bg-gray-100 p-4 text-gray-700">
              {stepsError.message}
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* -----------------------------------------
     MAIN UI
  ----------------------------------------- */

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">

        {/* HEADER */}

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            AI Agent Workflow Builder
          </h1>

          <p className="mt-2 text-gray-600">
            Build and run AI-powered workflows.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">

          {/* WORKFLOW BUILDER */}

          <section className="rounded-xl bg-white p-6 shadow md:col-span-2">

            <label className="mb-2 block font-semibold text-gray-700">
              Workflow Name
            </label>

            <input
              value={workflowName}
              onChange={(e) =>
                setWorkflowName(e.target.value)
              }
              className="mb-6 w-full rounded-lg border border-gray-300 px-4 py-3"
            />

            {/* STEPS HEADER */}

            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                Workflow Steps
              </h2>

              <button
                onClick={addStep}
                className="rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800"
              >
                + Add Step
              </button>
            </div>

            {/* STEPS */}

            <div className="space-y-4">

              {steps.length === 0 ? (
                <p className="text-gray-500">
                  No workflow steps found.
                </p>
              ) : (
                steps.map((step, index) => (
                  <div
                    key={
                      step.id ?? index
                    }
                    className="rounded-lg border border-gray-200 p-4"
                  >

                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-semibold">
                        Step {index + 1}
                      </span>

                      <button
                        onClick={() =>
                          removeStep(index)
                        }
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>

                    <label className="mb-1 block text-sm text-gray-600">
                      Step Name
                    </label>

                    <input
                      value={step.name}
                      onChange={(e) =>
                        updateStepName(
                          index,
                          e.target.value
                        )
                      }
                      className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2"
                    />

                    <label className="mb-1 block text-sm text-gray-600">
                      Step Type
                    </label>

                    <select
                      value={step.type}
                      onChange={(e) =>
                        updateStepType(
                          index,
                          e.target.value
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    >
                      {stepTypes.map(
                        (type) => (
                          <option
                            key={type}
                            value={type}
                          >
                            {type}
                          </option>
                        )
                      )}
                    </select>

                  </div>
                ))
              )}

            </div>

            {/* RUN BUTTON */}

            <button
              onClick={runWorkflow}
              disabled={workflowLoading}
              className="mt-6 w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {workflowLoading
                ? "Starting..."
                : "▶ Run Workflow"}
            </button>

          </section>

          {/* SIDEBAR */}

          <aside className="space-y-6">

            {/* ORGANIZATION */}

            <div className="rounded-xl bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold">
                Organization
              </h2>

              <p className="text-gray-600">
                Organization A
              </p>

              <p className="mt-2 text-sm text-gray-500">
                Role: owner
              </p>
            </div>

            {/* QUOTA */}

            <div className="rounded-xl bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold">
                Usage / Quota
              </h2>

              <div className="mb-2 flex justify-between">
                <span>
                  Calls used
                </span>

                <span>
                  0 / 100
                </span>
              </div>

              <div className="h-3 rounded-full bg-gray-200">
                <div className="h-3 w-0 rounded-full bg-blue-600" />
              </div>
            </div>

            {/* LATEST RUN */}

            <div className="rounded-xl bg-white p-6 shadow">

              <h2 className="mb-4 text-lg font-semibold">
                Latest Run
              </h2>

              {latestRun ? (
                <div className="space-y-4">

                  {/* RUN INFO */}

                  <div className="space-y-2">

                    <p>
                      <strong>
                        Status:
                      </strong>{" "}

                      <span
                        className={`font-medium ${
                          latestRun.status ===
                          "paused"
                            ? "text-orange-600"
                            : latestRun.status ===
                              "completed"
                              ? "text-green-600"
                              : "text-blue-600"
                        }`}
                      >
                        {latestRun.status}
                      </span>
                    </p>

                    <p>
                      <strong>
                        Message:
                      </strong>{" "}
                      {latestRun.message}
                    </p>

                    <p className="break-all text-xs text-gray-500">
                      Run ID:{" "}
                      {latestRun.id}
                    </p>

                  </div>

                  {/* EXECUTION STEPS */}

                  <div>

                    <h3 className="mb-2 font-semibold">
                      Execution Steps
                    </h3>

                    <div className="space-y-2">

                      {runSteps.map(
                        (step, index) => {

                          const isApproval =
                            step ===
                            "Approval Required";

                          return (
                            <div
                              key={step}
                              className="rounded-lg bg-gray-50 p-3"
                            >

                              <div className="flex items-center gap-2">

                                <span className="font-semibold">
                                  {index + 1}.
                                </span>

                                <span>
                                  {step}
                                </span>

                                <span className="ml-auto font-semibold">
                                  {isApproval &&
                                  latestRun.status ===
                                    "paused"
                                    ? "⏸"
                                    : "✓"}
                                </span>

                              </div>

                              {/* APPROVE BUTTON */}

                              {isApproval &&
                                latestRun.status ===
                                  "paused" && (
                                  <button
                                    onClick={
                                      approveWorkflow
                                    }
                                    disabled={
                                      approving
                                    }
                                    className="mt-3 w-full rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {approving
                                      ? "Approving..."
                                      : "✓ Approve Workflow"}
                                  </button>
                                )}

                            </div>
                          );
                        }
                      )}

                    </div>

                  </div>

                </div>
              ) : (
                <p className="text-gray-500">
                  No workflow run yet.
                </p>
              )}

            </div>

          </aside>

        </div>
      </div>
    </main>
  );
}
