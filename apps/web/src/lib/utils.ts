import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { toolUIRegistry, type ToolName } from "./tool-registry";
import { ComponentType } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const isToolName = (toolType: string): toolType is ToolName => {
  return toolType in toolUIRegistry;
};

export const hasGenerativeUI = (toolType: string): boolean => {
  return isToolName(toolType);
};

export const getToolUIComponent = (
  toolType: string,
): ComponentType<Record<string, unknown>> | null => {
  if (isToolName(toolType)) {
    return toolUIRegistry[toolType] as ComponentType<Record<string, unknown>>;
  }
  return null;
};
