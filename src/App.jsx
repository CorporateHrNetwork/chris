import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import MainLayout from "./layouts/MainLayout";

import ProtectedRoute from "./components/auth/ProtectedRoute";
import PermissionRoute from "./components/auth/PermissionRoute";

import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";

import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import EmployeeProfile from "./components/employees/EmployeeProfile";
import Recruitment from "./pages/Recruitment";
import Attendance from "./pages/Attendance";
import Leave from "./pages/Leave";
import Payroll from "./pages/Payroll";
import Loans from "./pages/Loans";
import Performance from "./pages/Performance";
import Training from "./pages/Training";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

function ProtectedLayout({
  children,
}) {
  return (
    <ProtectedRoute>
      <MainLayout>
        {children}
      </MainLayout>
    </ProtectedRoute>
  );
}

function PermissionLayout({
  permission,
  children,
}) {
  return (
    <ProtectedLayout>
      <PermissionRoute
        permission={permission}
      >
        {children}
      </PermissionRoute>
    </ProtectedLayout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC AUTHENTICATION ROUTES */}
        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/reset-password"
          element={
            <ResetPassword />
          }
        />

        {/* DASHBOARD */}
        <Route
          path="/"
          element={
            <PermissionLayout
              permission="dashboard.view"
            >
              <Dashboard />
            </PermissionLayout>
          }
        />

        {/* EMPLOYEES */}
        <Route
          path="/employees"
          element={
            <PermissionLayout
              permission="employees.view"
            >
              <Employees />
            </PermissionLayout>
          }
        />

        <Route
          path="/employees/:employeeNumber"
          element={
            <PermissionLayout
              permission="employees.view"
            >
              <EmployeeProfile />
            </PermissionLayout>
          }
        />

        {/* RECRUITMENT */}
        <Route
          path="/recruitment"
          element={
            <PermissionLayout
              permission="recruitment.view"
            >
              <Recruitment />
            </PermissionLayout>
          }
        />

        {/* ATTENDANCE */}
        <Route
          path="/attendance"
          element={
            <PermissionLayout
              permission="attendance.view"
            >
              <Attendance />
            </PermissionLayout>
          }
        />

        {/* LEAVE */}
        <Route
          path="/leave"
          element={
            <PermissionLayout
              permission="leave.view"
            >
              <Leave />
            </PermissionLayout>
          }
        />

        {/* PAYROLL */}
        <Route
          path="/payroll"
          element={
            <PermissionLayout
              permission="payroll.view"
            >
              <Payroll />
            </PermissionLayout>
          }
        />

        {/* LOANS */}
        <Route
          path="/loans"
          element={
            <PermissionLayout
              permission="loans.view"
            >
              <Loans />
            </PermissionLayout>
          }
        />

        {/* PERFORMANCE */}
        <Route
          path="/performance"
          element={
            <PermissionLayout
              permission="performance.view"
            >
              <Performance />
            </PermissionLayout>
          }
        />

        {/* TRAINING */}
        <Route
          path="/training"
          element={
            <PermissionLayout
              permission="training.view"
            >
              <Training />
            </PermissionLayout>
          }
        />

        {/* REPORTS */}
        <Route
          path="/reports"
          element={
            <PermissionLayout
              permission="reports.view"
            >
              <Reports />
            </PermissionLayout>
          }
        />

        {/* SETTINGS */}
        <Route
          path="/settings"
          element={
            <PermissionLayout
              permission="settings.view"
            >
              <Settings />
            </PermissionLayout>
          }
        />

        {/* UNKNOWN ROUTES */}
        <Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;