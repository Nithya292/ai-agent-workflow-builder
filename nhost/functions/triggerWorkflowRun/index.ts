export default function handler(req: any, res: any) {
  console.log("Received body:", req.body);

  const workflowId = req.body?.workflow_id;

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