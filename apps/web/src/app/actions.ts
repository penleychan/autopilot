"use server";

import { mastraClient } from "@/lib/mastra-client";

export async function callAgent() {
  const agent = mastraClient.getAgent("weather-agent");
  const res = await agent.generate("What's the weather in edmonton?");
  return res.text;
}
