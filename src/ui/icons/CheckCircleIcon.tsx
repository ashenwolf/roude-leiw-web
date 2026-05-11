import { IconBase, type IconProps } from "./IconBase";

export const CheckCircleIcon = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.5 11.5 11 14l4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </IconBase>
);
