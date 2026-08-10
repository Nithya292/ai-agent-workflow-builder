"use client";

import { useState } from "react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";

const stepTypes = [
  "llm_call",
  "http_request",
  "conditional_branch",
  "approval_gate",
];

const TRIGGER_WORKFLOW = gql`
  mutation TriggerWorkflowRun($workflow_id: uuid!) {
    triggerWorkflowRun(workflow_id: $workflow_id) {
      run_id
      status
      message
    }
  }
`;

export default function Home() {
  const [workflowName, setWorkflowName] =
    useState("AI Demo Workflow");

  const [steps, setSteps] = useState([
    {
      name: "Generate AI Response",
      type: "llm_call",
    },
    {
      name: "Get API Data",
      type: "http_request",
    },
    {
      name: "Check AI Response",
      type: "conditional_branch",
    },
    {
      name: "Approval Required",
      type: "approval_gate",
    },
  ]);

  const [triggerWorkflow, { loading }] =
    useMutation(TRIGGER_WORKFLOW);

  function addStep() {
    setSteps([
      ...steps,
      {
        name: `New Step ${steps.length + 1}`,
        type: "llm_call",
      },
    ]);
  }

  function removeStep(index: number) {
    setSteps(
      steps.filter((_, i) => i !== index)
    );
  }

  function updateStepType(
    index: number,
    type: string
  ) {
    const updated = [...steps];

    updated[index] = {
      ...updated[index],
      type,
    };

    setSteps(updated);
  }

  function updateStepName(
    index: number,
    name: string
  ) {
    const updated = [...steps];

    updated[index] = {
      ...updated[index],
      name,
    };

    setSteps(updated);
  }

  async function runWorkflow() {
    try {
      const result = await triggerWorkflow({
        variables: {
          workflow_id:
            "ba8cf45f-2ec6-4751-b403-0261c6f7fbe9",
        },
      });

      console.log(
        "Workflow result:",
        result.data
      );

      alert(
        result.data?.triggerWorkflowRun?.message ||
          "Workflow started."
      );
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

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-5xl">

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

              {steps.map((step, index) => (
                <div
                  key={index}
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

                  {/* STEP NAME */}
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
                    {stepTypes.map((type) => (
                      <option
                        key={type}
                        value={type}
                      >
                        {type}
                      </option>
                    ))}
                  </select>

                </div>
              ))}

            </div>

            {/* RUN WORKFLOW */}
            <button
              onClick={runWorkflow}
              disabled={loading}
              className="mt-6 w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
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
                <span>Calls used</span>

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

              <p className="text-gray-500">
                No workflow run yet.
              </p>

            </div>

          </aside>

        </div>
      </div>
    </main>
  );
}