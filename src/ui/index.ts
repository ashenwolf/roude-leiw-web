export const UiColorMap = {
  primary: ["bg-lime-300", "hover:bg-lime-500", "inset-shadow-lime-500"],
  secondary: [],
} as const;

export type UiColor = keyof typeof UiColorMap;

export { Button } from "./Button";
export { Pill } from "./Pill";
export { AppWrapper } from "./AppWrapper";
