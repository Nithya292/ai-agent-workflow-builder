export default async function handler(req: Request) {
  const body = await req.json();

  console.log("Received:", body);

  return new Response(
    JSON.stringify({
      run_id: body.workflow_id,
      status: "started",
      message: "Workflow started successfully",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}