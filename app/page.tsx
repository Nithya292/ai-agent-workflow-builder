"use client";

import { gql } from "@apollo/client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";

/* -----------------------------------------
   WORKFLOW ID
----------------------------------------- */

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
   GRAPHQL MUTATION
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

/* -----------------------------------------
   AVAILABLE STEP TYPES
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

  /* -----------------------------------------
     LOAD WORKFLOW STEPS
  ----------------------------------------- */

  const {
    data,
    loading: stepsLoading,
    error: stepsError,
  } = useQuery<{
    workflow_steps: WorkflowStep[];
  }>(GET_WORKFLOW_STEPS);

  /* -----------------------------------------
     RUN WORKFLOW
  ----------------------------------------- */

  const [
    triggerWorkflow,
    { loading: workflowLoading },
  ] = useMutation(TRIGGER_WORKFLOW);

  /* -----------------------------------------
     PUT DATABASE STEPS INTO STATE
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

      if (workflowResult) {
        setLatestRun({
          id: workflowResult.run_id,
          status: workflowResult.status,
          message: workflowResult.message,
        });

        /*
          Display the workflow steps that
          the backend executes.
        */

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
      }
    } catch (error) {
      console.error(
        "Workflow error:",
        error
      );

      alert(
        "Workflow could not be started. Check the browser console."
      );
    }
  }

  /* -----------------------------------------
     LOADING STATE
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
     ERROR STATE
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

            {/* WORKFLOW NAME */}

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

            {/* WORKFLOW STEPS HEADER */}

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
                    key={step.id ?? index}
                    className="rounded-lg border border-gray-200 p-4"
                  >

                    {/* STEP HEADER */}

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

                    {/* STEP NAME */}

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

                    {/* STEP TYPE */}

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

            {/* RUN WORKFLOW BUTTON */}

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

                  {/* RUN INFORMATION */}

                  <div className="space-y-2">

                    <p>
                      <strong>
                        Status:
                      </strong>{" "}
                      <span className="font-medium text-blue-600">
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
                      Run ID: {latestRun.id}
                    </p>

                  </div>

                  {/* EXECUTION STEPS */}

                  <div>

                    <h3 className="mb-2 font-semibold">
                      Execution Steps
                    </h3>

                    <div className="space-y-2">

                      {runSteps.map(
                        (step, index) => (

                          <div
                            key={step}
                            className="flex items-center gap-2 rounded-lg bg-gray-50 p-2"
                          >

                            <span className="font-semibold">
                              {index + 1}.
                            </span>

                            <span>
                              {step}
                            </span>

                            <span className="ml-auto font-semibold text-green-600">
                              ✓
                            </span>

                          </div>

                        )
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

