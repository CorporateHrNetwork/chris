import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";

import Dashboard from "../pages/Dashboard";
import Employees from "../pages/Employees";
import AttendanceManagement from "../pages/AttendanceManagement";

function AppRoutes() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/leave" element={<Navigate to="/leave/requests" replace />} />
          <Route path="/attendance" element={<AttendanceManagement />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}

export default AppRoutes;
