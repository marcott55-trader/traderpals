import { NextRequest, NextResponse } from "next/server";
import { ingestWebhookRequest, verifyWebhookRequest } from "@/lib/webhook-ingest";
import { hasWebhookSecret } from "@/lib/webhook-flags";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  if (!hasWebhookSecret()) {
    return NextResponse.json(
      { error: "WEBHOOK_SHARED_SECRET is not configured" },
      { status: 503 }
    );
  }

  if (!verifyWebhookRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { provider } = await params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const result = await ingestWebhookRequest(request, provider, payload);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "webhook processing failed" },
      { status: 500 }
    );
  }
}
