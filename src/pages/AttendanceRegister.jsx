import NorthstarAttendance from "../demo/NorthstarAttendance";
import { getStoredOrganization } from "../services/api";
import AttendanceManagement from "./AttendanceManagement";

export default function AttendanceRegister() {
  return getStoredOrganization()?.slug === "chris-demo-company"
    ? <NorthstarAttendance />
    : <AttendanceManagement view="register" />;
}
