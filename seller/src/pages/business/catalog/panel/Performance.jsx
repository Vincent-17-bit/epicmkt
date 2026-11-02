import PerformancePanel from "../../PerformancePanel.jsx";

export default function Performance({ item }) {
  return <PerformancePanel itemId={item.id} title="Views and taps" />;
}
