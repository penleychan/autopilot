import { Weather, type WeatherProps } from "@/components/tools/weather";
import { ComponentType } from "react";

export type ToolPropsMap = {
  "tool-weatherTool": WeatherProps;
};

export type ToolName = keyof ToolPropsMap;

export const toolUIRegistry: {
  [K in ToolName]: ComponentType<ToolPropsMap[K]>;
} = {
  "tool-weatherTool": Weather,
};
