import { Navigate } from "react-router-dom";

/*
 * Compatibility component for old imports and bookmarks. The former
 * manual-units workflow is retired; /leave/requests is authoritative.
 */
export default function LeaveManagement() {
  return <Navigate to="/leave/requests" replace />;
}
