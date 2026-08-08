import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  FaUsers,
  FaUserShield,
  FaCheckCircle,
  FaBan,
  FaUserPlus,
} from "react-icons/fa";

import { apiRequest } from "../../services/api";
import useAuthorization from "../../hooks/useAuthorization";
import CreateUserForm from "./CreateUserForm";

function UsersRolesSettings() {
  const [activeTab, setActiveTab] =
    useState("users");

  const [showCreateUser, setShowCreateUser] =
    useState(false);

  const [users, setUsers] =
    useState([]);

  const [roles, setRoles] =
    useState([]);

  const [usersLoading, setUsersLoading] =
    useState(true);

  const [rolesLoading, setRolesLoading] =
    useState(true);

  const [usersError, setUsersError] =
    useState("");

  const [rolesError, setRolesError] =
    useState("");

  const {
    hasPermission,
  } = useAuthorization();

  const canViewUsers =
    hasPermission("users.view");

  const canManageUsers =
    hasPermission("users.manage");

  const canViewRoles =
    hasPermission("roles.view");

  const canManageRoles =
    hasPermission("roles.manage");

  const loadUsers =
    useCallback(async () => {
      if (!canViewUsers) {
        setUsersLoading(false);
        return;
      }

      try {
        setUsersLoading(true);
        setUsersError("");

        const result =
          await apiRequest(
            "/api/users"
          );

        setUsers(
          result.data || []
        );
      } catch (error) {
        console.error(
          "CHRIS users settings error:",
          error
        );

        setUsersError(
          error.message ||
            "Unable to load CHRIS users."
        );
      } finally {
        setUsersLoading(false);
      }
    }, [canViewUsers]);

  const loadRoles =
    useCallback(async () => {
      if (!canViewRoles) {
        setRolesLoading(false);
        return;
      }

      try {
        setRolesLoading(true);
        setRolesError("");

        const result =
          await apiRequest(
            "/api/roles"
          );

        setRoles(
          result.data || []
        );
      } catch (error) {
        console.error(
          "CHRIS roles settings error:",
          error
        );

        setRolesError(
          error.message ||
            "Unable to load CHRIS roles."
        );
      } finally {
        setRolesLoading(false);
      }
    }, [canViewRoles]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const handleUserCreated =
    async () => {
      /*
        Close the form immediately
        after successful creation.
      */
      setShowCreateUser(false);

      /*
        Refresh both because:
        - Users table changes
        - Assigned Role user count changes
      */
      await Promise.all([
        loadUsers(),
        loadRoles(),
      ]);
    };

  const activeUsers =
    users.filter(
      (user) => user.isActive
    ).length;

  const inactiveUsers =
    users.filter(
      (user) => !user.isActive
    ).length;

  return (
    <div>
      {/* PAGE HEADER */}
      <div
        style={{
          marginBottom: "28px",
        }}
      >
        <p
          style={{
            margin: "0 0 6px",
            color: "#64748B",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          Administration
        </p>

        <h1
          style={{
            margin: 0,
            color: "#0B5E3B",
            fontSize: "32px",
            fontWeight: "800",
          }}
        >
          Users & Roles
        </h1>

        <p
          style={{
            margin: "8px 0 0",
            color: "#64748B",
            fontSize: "15px",
            lineHeight: 1.6,
          }}
        >
          Manage CHRIS user access,
          system roles and authorization
          assignments.
        </p>
      </div>

      {/* SUMMARY CARDS */}
      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",

          gap: "18px",
          marginBottom: "28px",
        }}
      >
        <SummaryCard
          icon={<FaUsers />}
          title="Total Users"
          value={
            usersLoading
              ? "..."
              : users.length
          }
          subtitle="CHRIS user accounts"
        />

        <SummaryCard
          icon={<FaCheckCircle />}
          title="Active Users"
          value={
            usersLoading
              ? "..."
              : activeUsers
          }
          subtitle="Currently enabled"
        />

        <SummaryCard
          icon={<FaBan />}
          title="Inactive Users"
          value={
            usersLoading
              ? "..."
              : inactiveUsers
          }
          subtitle="Currently disabled"
        />

        <SummaryCard
          icon={<FaUserShield />}
          title="System Roles"
          value={
            rolesLoading
              ? "..."
              : roles.length
          }
          subtitle="Available CHRIS roles"
        />
      </div>

      {/* TABS */}
      <div
        style={{
          display: "flex",
          gap: "8px",

          marginBottom: "20px",

          borderBottom:
            "1px solid #E5E7EB",
        }}
      >
        <TabButton
          active={
            activeTab === "users"
          }
          onClick={() => {
            setActiveTab("users");
          }}
        >
          Users
        </TabButton>

        <TabButton
          active={
            activeTab === "roles"
          }
          onClick={() => {
            setActiveTab("roles");
            setShowCreateUser(false);
          }}
        >
          Roles & Permissions
        </TabButton>
      </div>

      {/* CREATE USER FORM */}
      {activeTab === "users" &&
        showCreateUser &&
        canManageUsers && (
          <CreateUserForm
            roles={roles}
            onCancel={() =>
              setShowCreateUser(false)
            }
            onCreated={
              handleUserCreated
            }
          />
        )}

      {/* USERS TAB */}
      {activeTab === "users" && (
        <UsersTab
          users={users}
          loading={usersLoading}
          error={usersError}
          canView={canViewUsers}
          canManage={
            canManageUsers
          }
          showCreateUser={
            showCreateUser
          }
          onCreateUser={() =>
            setShowCreateUser(true)
          }
        />
      )}

      {/* ROLES TAB */}
      {activeTab === "roles" && (
        <RolesTab
          roles={roles}
          loading={rolesLoading}
          error={rolesError}
          canView={canViewRoles}
          canManage={
            canManageRoles
          }
        />
      )}
    </div>
  );
}

function UsersTab({
  users,
  loading,
  error,
  canView,
  canManage,
  showCreateUser,
  onCreateUser,
}) {
  if (!canView) {
    return (
      <AccessNotice
        message="You do not have permission to view CHRIS users."
      />
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",

          justifyContent:
            "space-between",

          alignItems: "center",

          gap: "16px",

          marginBottom: "18px",

          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              color: "#0F172A",
              fontSize: "20px",
              fontWeight: "800",
            }}
          >
            User Accounts
          </h2>

          <p
            style={{
              margin: "5px 0 0",
              color: "#64748B",
              fontSize: "13px",
            }}
          >
            Users registered within
            this CHRIS organization.
          </p>
        </div>

        {canManage &&
          !showCreateUser && (
            <button
              type="button"
              onClick={
                onCreateUser
              }
              style={
                createButtonStyle
              }
            >
              <FaUserPlus />

              + Create User
            </button>
          )}
      </div>

      {error && (
        <ErrorBox
          message={error}
        />
      )}

      <div
        style={
          tableContainerStyle
        }
      >
        {loading ? (
          <LoadingMessage
            message="Loading CHRIS users..."
          />
        ) : users.length === 0 ? (
          <EmptyMessage
            message="No CHRIS users found."
          />
        ) : (
          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table
              style={tableStyle}
            >
              <thead>
                <tr>
                  <TableHeader>
                    User
                  </TableHeader>

                  <TableHeader>
                    Email
                  </TableHeader>

                  <TableHeader>
                    Role
                  </TableHeader>

                  <TableHeader>
                    Status
                  </TableHeader>

                  <TableHeader>
                    Created
                  </TableHeader>
                </tr>
              </thead>

              <tbody>
                {users.map(
                  (user) => (
                    <tr
                      key={
                        user.id
                      }
                      style={{
                        borderTop:
                          "1px solid #E5E7EB",
                      }}
                    >
                      <TableCell>
                        <div
                          style={{
                            fontWeight:
                              "700",

                            color:
                              "#0F172A",
                          }}
                        >
                          {getUserName(
                            user
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        {user.email}
                      </TableCell>

                      <TableCell>
                        <div
                          style={{
                            display:
                              "flex",

                            gap: "6px",

                            flexWrap:
                              "wrap",
                          }}
                        >
                          {user.roles
                            ?.length >
                          0 ? (
                            user.roles.map(
                              (
                                role
                              ) => (
                                <span
                                  key={
                                    role.id
                                  }
                                  style={
                                    roleBadgeStyle
                                  }
                                >
                                  {
                                    role.name
                                  }
                                </span>
                              )
                            )
                          ) : (
                            <span
                              style={{
                                color:
                                  "#94A3B8",
                              }}
                            >
                              No role
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <StatusBadge
                          active={
                            user.isActive
                          }
                        />
                      </TableCell>

                      <TableCell>
                        {formatDate(
                          user.createdAt
                        )}
                      </TableCell>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RolesTab({
  roles,
  loading,
  error,
  canView,
  canManage,
}) {
  if (!canView) {
    return (
      <AccessNotice
        message="You do not have permission to view CHRIS roles."
      />
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",

          justifyContent:
            "space-between",

          alignItems: "center",

          gap: "16px",

          marginBottom: "18px",

          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              color: "#0F172A",
              fontSize: "20px",
              fontWeight: "800",
            }}
          >
            Roles & Permissions
          </h2>

          <p
            style={{
              margin: "5px 0 0",
              color: "#64748B",
              fontSize: "13px",
            }}
          >
            Organization roles and
            their authorization scope.
          </p>
        </div>

        {canManage && (
          <span
            style={
              manageBadgeStyle
            }
          >
            Role Management Enabled
          </span>
        )}
      </div>

      {error && (
        <ErrorBox
          message={error}
        />
      )}

      {loading ? (
        <LoadingMessage
          message="Loading CHRIS roles..."
        />
      ) : roles.length === 0 ? (
        <EmptyMessage
          message="No CHRIS roles found."
        />
      ) : (
        <div
          style={{
            display: "grid",

            gridTemplateColumns:
              "repeat(auto-fit, minmax(280px, 1fr))",

            gap: "18px",
          }}
        >
          {roles.map(
            (role) => (
              <div
                key={role.id}
                style={
                  roleCardStyle
                }
              >
                <div
                  style={{
                    display:
                      "flex",

                    justifyContent:
                      "space-between",

                    gap: "12px",

                    alignItems:
                      "flex-start",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,

                        color:
                          "#0B5E3B",

                        fontSize:
                          "17px",

                        fontWeight:
                          "800",
                      }}
                    >
                      {role.name}
                    </h3>

                    {role.isSystemRole && (
                      <span
                        style={
                          systemRoleBadgeStyle
                        }
                      >
                        SYSTEM ROLE
                      </span>
                    )}
                  </div>

                  <FaUserShield
                    style={{
                      color:
                        "#D4AF37",

                      fontSize:
                        "22px",
                    }}
                  />
                </div>

                <p
                  style={{
                    margin:
                      "14px 0 18px",

                    color:
                      "#64748B",

                    fontSize:
                      "13px",

                    lineHeight:
                      1.6,
                  }}
                >
                  {role.description ||
                    "No role description available."}
                </p>

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "1fr 1fr",

                    gap: "12px",
                  }}
                >
                  <RoleMetric
                    label="Users"
                    value={
                      role.userCount ??
                      0
                    }
                  />

                  <RoleMetric
                    label="Permissions"
                    value={
                      role.permissionCount ??
                      0
                    }
                  />
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  subtitle,
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",

        border:
          "1px solid #E5E7EB",

        borderRadius: "16px",

        padding: "20px",

        boxShadow:
          "0 6px 20px rgba(15,23,42,0.05)",
      }}
    >
      <div
        style={{
          display: "flex",

          alignItems: "center",

          justifyContent:
            "space-between",

          marginBottom: "14px",
        }}
      >
        <span
          style={{
            color: "#0B5E3B",
            fontSize: "20px",
          }}
        >
          {icon}
        </span>

        <span
          style={{
            color: "#94A3B8",
            fontSize: "11px",
            fontWeight: "800",
            textTransform:
              "uppercase",
          }}
        >
          {title}
        </span>
      </div>

      <div
        style={{
          color: "#0B5E3B",
          fontSize: "30px",
          fontWeight: "800",
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: "6px",
          color: "#94A3B8",
          fontSize: "12px",
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",

        borderBottom: active
          ? "3px solid #0B5E3B"
          : "3px solid transparent",

        background: "transparent",

        padding: "12px 16px",

        color: active
          ? "#0B5E3B"
          : "#64748B",

        fontSize: "14px",
        fontWeight: "800",

        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function StatusBadge({
  active,
}) {
  return (
    <span
      style={{
        display: "inline-block",

        padding: "5px 9px",

        borderRadius: "20px",

        background: active
          ? "#ECFDF5"
          : "#FEF2F2",

        color: active
          ? "#047857"
          : "#B91C1C",

        fontSize: "11px",

        fontWeight: "800",
      }}
    >
      {active
        ? "Active"
        : "Inactive"}
    </span>
  );
}

function RoleMetric({
  label,
  value,
}) {
  return (
    <div
      style={{
        padding: "12px",

        background: "#F8FAFC",

        borderRadius: "10px",

        border:
          "1px solid #E2E8F0",
      }}
    >
      <div
        style={{
          color: "#0B5E3B",
          fontSize: "20px",
          fontWeight: "800",
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: "4px",

          color: "#64748B",

          fontSize: "11px",

          fontWeight: "700",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function TableHeader({
  children,
}) {
  return (
    <th
      style={{
        textAlign: "left",

        padding: "14px 16px",

        background: "#F8FAFC",

        color: "#475569",

        fontSize: "12px",

        fontWeight: "800",

        textTransform:
          "uppercase",

        letterSpacing:
          "0.03em",

        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
}) {
  return (
    <td
      style={{
        padding: "15px 16px",

        color: "#475569",

        fontSize: "13px",

        verticalAlign:
          "middle",
      }}
    >
      {children}
    </td>
  );
}

function ErrorBox({
  message,
}) {
  return (
    <div style={errorStyle}>
      {message}
    </div>
  );
}

function LoadingMessage({
  message,
}) {
  return (
    <div style={messageStyle}>
      {message}
    </div>
  );
}

function EmptyMessage({
  message,
}) {
  return (
    <div style={messageStyle}>
      {message}
    </div>
  );
}

function AccessNotice({
  message,
}) {
  return (
    <div
      style={{
        padding: "20px",

        background: "#FEF2F2",

        border:
          "1px solid #FECACA",

        borderRadius: "12px",

        color: "#991B1B",

        fontSize: "14px",

        fontWeight: "600",
      }}
    >
      {message}
    </div>
  );
}

function getUserName(user) {
  const fullName = [
    user.firstName,
    user.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    fullName ||
    "Unnamed User"
  );
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Date(
    value
  ).toLocaleDateString();
}

const createButtonStyle = {
  display: "flex",

  alignItems: "center",

  gap: "8px",

  padding: "11px 16px",

  background: "#0B5E3B",

  color: "#FFFFFF",

  border: "none",

  borderRadius: "9px",

  fontSize: "13px",

  fontWeight: "800",

  cursor: "pointer",

  boxShadow:
    "0 5px 14px rgba(11,94,59,0.18)",
};

const tableContainerStyle = {
  background: "#FFFFFF",

  border:
    "1px solid #E5E7EB",

  borderRadius: "14px",

  overflow: "hidden",

  boxShadow:
    "0 6px 20px rgba(15,23,42,0.04)",
};

const tableStyle = {
  width: "100%",

  borderCollapse:
    "collapse",
};

const roleBadgeStyle = {
  display: "inline-block",

  padding: "4px 8px",

  background: "#EFF6FF",

  color: "#1D4ED8",

  borderRadius: "20px",

  fontSize: "10px",

  fontWeight: "800",
};

const manageBadgeStyle = {
  display: "inline-block",

  padding: "6px 10px",

  background: "#ECFDF5",

  border:
    "1px solid #A7F3D0",

  borderRadius: "20px",

  color: "#047857",

  fontSize: "11px",

  fontWeight: "800",
};

const systemRoleBadgeStyle = {
  display: "inline-block",

  marginTop: "7px",

  padding: "4px 8px",

  background: "#ECFDF5",

  color: "#047857",

  border:
    "1px solid #A7F3D0",

  borderRadius: "20px",

  fontSize: "10px",

  fontWeight: "800",
};

const roleCardStyle = {
  background: "#FFFFFF",

  border:
    "1px solid #E5E7EB",

  borderRadius: "14px",

  padding: "20px",

  boxShadow:
    "0 6px 20px rgba(15,23,42,0.04)",
};

const errorStyle = {
  marginBottom: "18px",

  padding: "14px 16px",

  background: "#FEF2F2",

  border:
    "1px solid #FECACA",

  borderRadius: "10px",

  color: "#B91C1C",

  fontSize: "13px",

  fontWeight: "600",
};

const messageStyle = {
  padding: "28px",

  textAlign: "center",

  color: "#64748B",

  fontSize: "14px",
};

export default UsersRolesSettings;