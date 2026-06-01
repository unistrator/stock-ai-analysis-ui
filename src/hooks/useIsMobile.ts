import { Grid } from "antd";

const { useBreakpoint } = Grid;

export default function useIsMobile() {
  const screens = useBreakpoint();
  return !screens.md;
}
