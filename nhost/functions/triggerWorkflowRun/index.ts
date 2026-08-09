export default async function handler(req: any, res: any) {
  try {
    console.log("Received body:", req.body);

    const workflowId = req.body?.workflow_id;

    if (!workflowId) {
      return res.status(400).json({
        error: "workflow_id is required",
      });
    }

    return res.status(200).json({
      run_id: workflowId,
      status: "started",
      message: "Workflow started successfully",
    });
  } catch (error) {
    console.error("Webhook error:", error);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
}