export default function handler(req: any, res: any) {
  console.log("FULL BODY:", JSON.stringify(req.body));

  const workflowId = req.body?.input?.workflow_id;

  console.log("WORKFLOW ID:", workflowId);

  if (!workflowId) {
    return res.status(200).json({
      run_id: "00000000-0000-0000-0000-000000000000",
      status: "failed",
      message: "workflow_id is required",
    });
  }

  return res.status(200).json({
    run_id: workflowId,
    status: "started",
    message: "Workflow started successfully",
  });
}