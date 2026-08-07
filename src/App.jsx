import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import MainLayout from "./layouts/MainLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";

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

function ProtectedLayout({ children }) {
  return (
    <ProtectedRoute>
      <MainLayout>
        {children}
      </MainLayout>
    </ProtectedRoute>
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
          element={<ResetPassword />}
        />

        {/* PROTECTED CHRIS ROUTES */}
        <Route
          path="/"
          element={
            <ProtectedLayout>
              <Dashboard />
            </ProtectedLayout>
          }
        />

        <Route
          path="/employees"
          element={
            <ProtectedLayout>
              <Employees />
            </ProtectedLayout>
          }
        />

        <Route
          path="/employees/:employeeNumber"
          element={
            <ProtectedLayout>
              <EmployeeProfile />
            </ProtectedLayout>
          }
        />

        <Route
          path="/recruitment"
          element={
            <ProtectedLayout>
              <Recruitment />
            </ProtectedLayout>
          }
        />

        <Route
          path="/attendance"
          element={
            <ProtectedLayout>
              <Attendance />
            </ProtectedLayout>
          }
        />

        <Route
          path="/leave"
          element={
            <ProtectedLayout>
              <Leave />
            </ProtectedLayout>
          }
        />

        <Route
          path="/payroll"
          element={
            <ProtectedLayout>
              <Payroll />
            </ProtectedLayout>
          }
        />

        <Route
          path="/loans"
          element={
            <ProtectedLayout>
              <Loans />
            </ProtectedLayout>
          }
        />

        <Route
          path="/performance"
          element={
            <ProtectedLayout>
              <Performance />
            </ProtectedLayout>
          }
        />

        <Route
          path="/training"
          element={
            <ProtectedLayout>
              <Training />
            </ProtectedLayout>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedLayout>
              <Reports />
            </ProtectedLayout>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedLayout>
              <Settings />
            </ProtectedLayout>
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