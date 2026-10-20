import OperationalControlWorkspace from "./shared/OperationalControlWorkspace";
import PerformanceEvaluationWorkspace from "../components/performance/PerformanceEvaluationWorkspace";
export default function Performance() {
  return <PerformanceEvaluationWorkspace><OperationalControlWorkspace module="PERFORMANCE" area="DASHBOARD" /></PerformanceEvaluationWorkspace>;
}
