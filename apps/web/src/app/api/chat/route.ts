import { toAISdkV5Messages } from "@mastra/ai-sdk/ui";
import { NextResponse } from "next/server";
import { mastraClient } from "@/lib/mastra-client";

const MASTRA_API_URL = process.env.MASTRA_API_URL || "http://localhost:4111";
const AGENT_ID = process.env.MASTRA_AGENT_ID || "weather-agent";
const THREAD_ID = "example-user-id";
const RESOURCE_ID = "weather-chat";

export async function GET() {
  let messages = null;

  try {
    const response = await mastraClient.getMemoryThread({
      threadId: THREAD_ID,
      agentId: AGENT_ID,
    });
    messages =
      (await response.listMessages({
        resourceId: RESOURCE_ID,
      })) || [];
  } catch {
    console.log("No previous messages found.");
  }

  const uiMessages = toAISdkV5Messages(messages?.messages || []);

  return NextResponse.json(uiMessages);
}
