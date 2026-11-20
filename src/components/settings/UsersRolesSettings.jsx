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
  FaEdit,
  FaToggleOn,
  FaToggleOff,
} from "react-icons/fa";
import "./UsersRolesSettings.chris.css";

import {
  apiRequest,
} from "../../services/api";

import useAuthorization from "../../hooks/useAuthorization";

import CreateUserForm from "./CreateUserForm";
import CreateRoleForm from "./CreateRoleForm";
import EditUserForm from "./EditUserForm";
import RolePermissionsEditor from "./RolePermissionsEditor";


import "./chris-settings-visual.css";
function UsersRolesSettings() {
  const [
    activeTab,
    setActiveTab,
  ] = useState("users");

  const [
    showCreateUser,
    setShowCreateUser,
  ] = useState(false);

  const [
    editingUser,
    setEditingUser,
  ] = useState(null);

  const [
    selectedRole,
    setSelectedRole,
  ] = useState(null);

  const [
    showCreateRole,
    setShowCreateRole,
  ] = useState(false);

  const [
    users,
    setUsers,
  ] = useState([]);

  const [
    roles,
    setRoles,
  ] = useState([]);

  const [
    usersLoading,
    setUsersLoading,
  ] = useState(true);

  const [
    rolesLoading,
    setRolesLoading,
  ] = useState(true);

  const [
    usersError,
    setUsersError,
  ] = useState("");

  const [
    rolesError,
    setRolesError,
  ] = useState("");

  const [
    actionMessage,
    setActionMessage,
  ] = useState("");

  const [
    actionError,
    setActionError,
  ] = useState("");

  const [
    statusUpdatingUserId,
    setStatusUpdatingUserId,
  ] = useState(null);

  const [
    essProvisioning,
    setEssProvisioning,
  ] = useState(false);

  const {
    hasPermission,
    profile,
  } = useAuthorization();

  const currentUserId =
    profile?.userId || null;

  const canViewUsers =
    hasPermission(
      "users.view"
    );

  const canManageUsers =
    hasPermission(
      "users.manage"
    );

  const canViewRoles =
    hasPermission(
      "roles.view"
    );

  const canManageRoles =
    hasPermission(
      "roles.manage"
    );

  /*
  ============================================================
  LOAD USERS
  ============================================================
  */
  const loadUsers =
    useCallback(
      async () => {
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
      },
      [canViewUsers]
    );

  /*
  ============================================================
  LOAD ROLES
  ============================================================
  */
  const loadRoles =
    useCallback(
      async () => {
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
      },
      [canViewRoles]
    );

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  /*
  ============================================================
  USER CREATED
  ============================================================
  */
  const handleUserCreated =
    async () => {
      setShowCreateUser(
        false
      );

      setActionError("");

      setActionMessage(
        "CHRIS user created successfully."
      );

      await Promise.all([
        loadUsers(),
        loadRoles(),
      ]);

      setTimeout(() => {
        setActionMessage("");
      }, 4000);
    };

  /*
  ============================================================
  USER UPDATED
  ============================================================
  */
  const handleUserUpdated =
    async () => {
      setEditingUser(null);

      setActionError("");

      setActionMessage(
        "CHRIS user updated successfully."
      );

      await Promise.all([
        loadUsers(),
        loadRoles(),
      ]);

      setTimeout(() => {
        setActionMessage("");
      }, 4000);
    };

  const handleRoleCreated =
    async () => {
      setShowCreateRole(false);
      setActionError("");
      setActionMessage("CHRIS role created successfully. Configure its permissions, then assign it to users.");
      await loadRoles();
      setTimeout(() => {
        setActionMessage("");
      }, 5000);
    };

  /*
  ============================================================
  ROLE PERMISSIONS SAVED
  ============================================================
  */
  const handleRolePermissionsSaved =
    async (updatedRole) => {
      await loadRoles();

      setSelectedRole(
        (current) => {
          if (!current) {
            return null;
          }

          return {
            ...current,

            permissionCount:
              updatedRole
                ?.permissions
                ?.length ??
              current.permissionCount,
          };
        }
      );
    };

  /*
  ============================================================
  OPEN CREATE USER
  ============================================================
  */
  const handleOpenCreateUser =
    () => {
      setEditingUser(null);

      setActionMessage("");
      setActionError("");

      setShowCreateUser(
        true
      );
    };

  const handleBulkEssProvision = async () => {
    if (!canManageUsers || essProvisioning) return;
    const confirmed = window.confirm(
      "Provision Employee Self Service accounts for all current Zermatt employees who have a work email and do not already have a CHRiS user account? Existing users will not be changed."
    );
    if (!confirmed) return;

    try {
      setEssProvisioning(true);
      setActionError("");
      setActionMessage("");
      const result = await apiRequest("/api/users/ess/provision-bulk", { method: "POST" });
      const rows = result?.data?.results || [];
      const successful = rows.filter((row) => row.success);
      if (successful.length) {
        const header = ["Employee Number","Employee Name","Email","Activation Link","Activation Expires"];
        const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
        const csv = "\uFEFF" + [header, ...successful.map((row) => [
          row.employeeNumber,row.employeeName,row.email,row.activationUrl,row.activationExpiresAt
        ])].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `CHRiS-Zermatt-ESS-Activation-Links-${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }
      setActionMessage(result?.message || "Employee Self Service accounts provisioned.");
      await Promise.all([loadUsers(), loadRoles()]);
    } catch (error) {
      setActionError(error.message || "Unable to provision Employee Self Service accounts.");
    } finally {
      setEssProvisioning(false);
    }
  };

  /*
  ============================================================
  OPEN EDIT USER
  ============================================================
  */
  const handleEditUser =
    (user) => {
      setShowCreateUser(
        false
      );

      setActionMessage("");
      setActionError("");

      setEditingUser(user);
    };

  useEffect(() => {
    if (!editingUser) return;

    const frame = window.requestAnimationFrame(() => {
      const editor = document.getElementById("chris-user-editor");
      if (editor) {
        editor.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [editingUser]);

  /*
  ============================================================
  ACTIVATE / DEACTIVATE USER
  ============================================================
  */
  const [recoveryUserId,setRecoveryUserId] = useState(null);
  const handleSendRecovery = async (user,portal) => {
    if (!canManageUsers || user.id === currentUserId) return;
    const label=portal === "ess" ? "ESS" : "CHRiS staff login";
    if (!window.confirm(`Send a one-time ${label} password reset link to ${user.email}? The link expires in 15 minutes.`))return;
    setRecoveryUserId(user.id);setActionError("");setActionMessage("");
    try {
      const response=await apiRequest(`/api/users/${user.id}/send-password-recovery`,{
        method:"POST",body:{portal,reason:"HR-authorized password recovery requested from User Management"}
      });
      setActionMessage(response.message || label+" password recovery email sent.");
    }catch(error){setActionError(error.message || "Unable to send password recovery email.");}
    finally{setRecoveryUserId(null);}
  };
  const handleSuspension = async user => {
    if (!canManageUsers || user.id === currentUserId) return;
    const suspended = !user.accessSuspendedAt;
    const verb=suspended?"Suspend":"Resume";
    const reason=window.prompt(`${verb} ${getUserName(user)} on both CHRiS staff login and ESS? Enter audit reason (at least 8 characters).`);
    if(reason==null)return;
    if(reason.trim().length<8){setActionError("Enter a reason of at least eight characters.");return;}
    setRecoveryUserId(user.id);setActionMessage("");setActionError("");
    try {
      const response=await apiRequest(`/api/users/${user.id}/suspension`,{
        method:"PATCH",body:{suspended,reason:reason.trim()}
      });
      setActionMessage(response.message || verb+" completed.");
      await loadUsers();
    }catch(error){setActionError(error.message || "Unable to change account suspension.");}
    finally{setRecoveryUserId(null);}
  };
  const handleStatusChange =
    async (user) => {
      if (!canManageUsers) {
        return;
      }

      if (
        user.id ===
          currentUserId &&
        user.isActive
      ) {
        setActionMessage("");

        setActionError(
          "You cannot deactivate your own CHRIS account."
        );

        return;
      }

      const nextStatus =
        !user.isActive;

      if (!nextStatus) {
        const confirmed =
          window.confirm(
            `Deactivate ${getUserName(
              user
            )}? This user will no longer be able to sign in to CHRIS.`
          );

        if (!confirmed) {
          return;
        }
      }

      try {
        setStatusUpdatingUserId(
          user.id
        );

        setActionMessage("");
        setActionError("");

        const result =
          await apiRequest(
            `/api/users/${user.id}/status`,
            {
              method:
                "PATCH",

              body:
                JSON.stringify(
                  {
                    isActive:
                      nextStatus,
                  }
                ),
            }
          );

        setActionMessage(
          result.message ||
            (nextStatus
              ? "CHRIS user activated successfully."
              : "CHRIS user deactivated successfully.")
        );

        await loadUsers();

        setTimeout(() => {
          setActionMessage(
            ""
          );
        }, 4000);
      } catch (error) {
        console.error(
          "CHRIS user status error:",
          error
        );

        setActionError(
          error.message ||
            "Unable to update CHRIS user status."
        );
      } finally {
        setStatusUpdatingUserId(
          null
        );
      }
    };

  const activeUsers =
    users.filter(
      (user) =>
        user.isActive
    ).length;

  const inactiveUsers =
    users.filter(
      (user) =>
        !user.isActive
    ).length;

  return (
    <div className="chris-users-roles">
      {/* HEADER */}
      <div
        style={{
          marginBottom:
            "28px",
        }}
      >
        <p
          style={{
            margin:
              "0 0 6px",

            color:
              "#64748B",

            fontSize:
              "14px",

            fontWeight:
              "600",
          }}
        >
          Administration
        </p>

        <h1
          style={{
            margin: 0,

            color:
              "#087A43",

            fontSize:
              "32px",

            fontWeight:
              "800",
          }}
        >
          Users & Roles
        </h1>

        <p
          style={{
            margin:
              "8px 0 0",

            color:
              "#64748B",

            fontSize:
              "15px",

            lineHeight:
              1.6,
          }}
        >
          Manage CHRIS user
          access, system roles
          and authorization
          assignments.
        </p>
      </div>

      {/* SUMMARY */}
      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",

          gap: "18px",

          marginBottom:
            "28px",
        }}
      >
        <SummaryCard
          icon={
            <FaUsers />
          }
          title="Total Users"
          value={
            usersLoading
              ? "..."
              : users.length
          }
          subtitle="CHRIS user accounts"
        />

        <SummaryCard
          icon={
            <FaCheckCircle />
          }
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
          icon={
            <FaUserShield />
          }
          title="System Roles"
          value={
            rolesLoading
              ? "..."
              : roles.length
          }
          subtitle="Available CHRIS roles"
        />
      </div>

      {actionMessage && (
        <div
          style={
            successStyle
          }
        >
          {actionMessage}
        </div>
      )}

      {actionError && (
        <div
          style={
            errorStyle
          }
        >
          {actionError}
        </div>
      )}

      {/* TABS */}
      <div
        style={{
          display: "flex",

          gap: "8px",

          marginBottom:
            "20px",

          borderBottom:
            "1px solid #E5E7EB",
        }}
      >
        <TabButton
          active={
            activeTab ===
            "users"
          }
          onClick={() => {
            setActiveTab(
              "users"
            );

            setSelectedRole(
              null
            );
          }}
        >
          Users
        </TabButton>

        <TabButton
          active={
            activeTab ===
            "roles"
          }
          onClick={() => {
            setActiveTab(
              "roles"
            );

            setShowCreateUser(
              false
            );

            setEditingUser(
              null
            );

            setSelectedRole(
              null
            );

            setActionMessage(
              ""
            );

            setActionError(
              ""
            );
          }}
        >
          Roles & Permissions
        </TabButton>
      </div>

      {/* CREATE USER */}
      {activeTab ===
        "users" &&
        showCreateUser &&
        canManageUsers && (
          <CreateUserForm
            roles={roles}

            onCancel={() =>
              setShowCreateUser(
                false
              )
            }

            onCreated={
              handleUserCreated
            }
          />
        )}

      {/* EDIT USER */}
      {activeTab ===
        "users" &&
        editingUser &&
        canManageUsers && (
          <div
            id="chris-user-editor"
            style={{ scrollMarginTop: "24px" }}
          >
            <EditUserForm
            user={
              editingUser
            }

            roles={
              roles
            }

            onCancel={() =>
              setEditingUser(
                null
              )
            }

            onUpdated={
              handleUserUpdated
            }
          />
          </div>
        )}

      {/* USERS TAB */}
      {activeTab ===
        "users" && (
          <UsersTab
            users={
              users
            }

            loading={
              usersLoading
            }

            error={
              usersError
            }

            canView={
              canViewUsers
            }

            canManage={
              canManageUsers
            }

            currentUserId={
              currentUserId
            }

            showCreateUser={
              showCreateUser
            }

            editingUser={
              editingUser
            }

            statusUpdatingUserId={
              statusUpdatingUserId
            }

            onCreateUser={
              handleOpenCreateUser
            }

            onBulkProvision={
              handleBulkEssProvision
            }

            essProvisioning={
              essProvisioning
            }

            onEditUser={
              handleEditUser
            }

            onStatusChange={
              handleStatusChange
            }
            onSendRecovery={handleSendRecovery}
            onSuspension={handleSuspension}
            recoveryUserId={recoveryUserId}
          />
        )}

      {/* ROLES TAB */}
      {activeTab ===
        "roles" && (
          <RolesTab
            roles={
              roles
            }

            loading={
              rolesLoading
            }

            error={
              rolesError
            }

            canView={
              canViewRoles
            }

            canManage={
              canManageRoles
            }

            selectedRole={
              selectedRole
            }

            showCreateRole={
              showCreateRole
            }

            onCreateRole={() => {
              setShowCreateRole(true);
              setSelectedRole(null);
              setActionMessage("");
              setActionError("");
            }}

            onRoleCreated={
              handleRoleCreated
            }

            onCancelCreateRole={() =>
              setShowCreateRole(false)
            }

            onSelectRole={
              setSelectedRole
            }

            onCloseRole={() =>
              setSelectedRole(
                null
              )
            }

            onSaved={
              handleRolePermissionsSaved
            }
          />
        )}
    </div>
  );
}

/*
============================================================
USERS TAB
============================================================
*/
function UsersTab({
  users,
  loading,
  error,
  canView,
  canManage,
  currentUserId,
  showCreateUser,
  editingUser,
  statusUpdatingUserId,
  onCreateUser,
  onBulkProvision,
  essProvisioning,
  onEditUser,
  onStatusChange,
  onSendRecovery,
  onSuspension,
  recoveryUserId,
}) {
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const normalizedQuery = employeeQuery.trim().toLocaleLowerCase();
  const candidateAccounts = users.filter(user => {
    if (!normalizedQuery) return true;
    const employee = user.employee || {};
    const terms = [
      getUserName(user), user.firstName, user.lastName, user.email,
      employee.firstName, employee.middleName, employee.lastName,
      employee.employeeNumber, employee.email,
    ].filter(Boolean).join(" ").toLocaleLowerCase();
    return normalizedQuery.split(/\s+/).every(token => terms.includes(token));
  });
  const visibleAccounts = selectedAccountId
    ? users.filter(user => user.id === selectedAccountId)
    : candidateAccounts;
  const employeeSuggestions = normalizedQuery.length >= 2 && !selectedAccountId
    ? candidateAccounts.slice(0, 12) : [];
  function chooseAccount(user) {
    setSelectedAccountId(user.id);
    setEmployeeQuery(
      [user.employee?.firstName, user.employee?.middleName, user.employee?.lastName]
        .filter(Boolean).join(" ") || getUserName(user)
    );
    setSuggestionsVisible(false);
  }
  function clearAccountSearch() {
    setEmployeeQuery("");
    setSelectedAccountId("");
    setSuggestionsVisible(false);
  }

  if (!canView) {
    return (
      <AccessNotice
        message="You do not have permission to view CHRIS users."
      />
    );
  }

  const managementFormOpen =
    showCreateUser ||
    Boolean(
      editingUser
    );

  return (
    <div>
      <div
        style={{
          display: "flex",

          justifyContent:
            "space-between",

          alignItems:
            "center",

          gap: "16px",

          marginBottom:
            "18px",

          flexWrap:
            "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,

              color:
                "#0F172A",

              fontSize:
                "20px",

              fontWeight:
                "800",
            }}
          >
            User Accounts
          </h2>

          <p
            style={{
              margin:
                "5px 0 0",

              color:
                "#64748B",

              fontSize:
                "13px",
            }}
          >
            Users registered
            within this CHRIS
            organization.
          </p>
        </div>

        {canManage &&
          !managementFormOpen && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={onBulkProvision}
                disabled={essProvisioning}
                style={createButtonStyle}
              >
                <FaUsers />
                {essProvisioning ? "Provisioning ESS…" : "Provision Zermatt ESS Accounts"}
              </button>
              <button
                type="button"
                onClick={onCreateUser}
                style={createButtonStyle}
              >
                <FaUserPlus />
                + Create User
              </button>
            </div>
          )}
      </div>

      <div style={{ marginBottom: 16, maxWidth: 600, position: "relative" }}>
        <label htmlFor="user-accounts-employee-search" style={{ display: "block", color: "#334155", fontWeight: 700, marginBottom: 6 }}>
          Type-search employee account
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            id="user-accounts-employee-search"
            type="search"
            autoComplete="off"
            aria-label="Search employee by name, number or email"
            aria-controls="user-account-employee-suggestions"
            aria-expanded={suggestionsVisible && employeeSuggestions.length > 0}
            value={employeeQuery}
            onFocus={() => setSuggestionsVisible(true)}
            onChange={event => {
              setEmployeeQuery(event.target.value);
              setSelectedAccountId("");
              setSuggestionsVisible(true);
            }}
            placeholder="Type employee first name, surname or number"
            style={{ flex: 1, minWidth: 160, border: "1px solid #CBD5E1", borderRadius: 8, padding: "11px 12px", color: "#0F172A", backgroundColor: "#FFF" }}
          />
          {(employeeQuery || selectedAccountId) && (
            <button type="button" onClick={clearAccountSearch} style={editButtonStyle}>
              Clear
            </button>
          )}
        </div>
        {suggestionsVisible && employeeSuggestions.length > 0 && (
          <div id="user-account-employee-suggestions" role="listbox" aria-label="Matching employee accounts"
            style={{ position: "absolute", zIndex: 10, width: "100%", background: "#FFF", border: "1px solid #CBD5E1", borderRadius: 8, boxShadow: "0 8px 22px rgba(15,23,42,.12)", maxHeight: 260, overflowY: "auto" }}>
            {employeeSuggestions.map(user => (
              <button type="button" role="option" aria-selected="false" key={user.id}
                onClick={() => chooseAccount(user)}
                style={{ width: "100%", background: "transparent", color: "#0F172A", border: 0, borderBottom: "1px solid #E2E8F0", padding: 10, textAlign: "left", cursor: "pointer", display: "block" }}>
                <strong>{[user.employee?.firstName, user.employee?.middleName, user.employee?.lastName].filter(Boolean).join(" ") || getUserName(user)}</strong>
                {" · "}{user.employee?.employeeNumber || "No linked employee"}
                {" · "}{user.employee?.location?.name || "Unassigned branch"}
                <span style={{ display: "block", fontSize: 12, color: "#64748B" }}>{user.email}</span>
              </button>
            ))}
          </div>
        )}
        {selectedAccountId && <p style={{ color: "#475569", fontSize: 12, margin: "6px 0 0" }}>Showing the selected employee account. Clear to return to all user accounts.</p>}
        {normalizedQuery.length > 0 && !visibleAccounts.length && !loading && (
          <p role="status" style={{ color: "#64748B", fontSize: 13, marginTop: 8 }}>No matching user account. Check the employee name, number or email.</p>
        )}
        <p style={{ color: "#64748B", fontSize: 12, margin: "6px 0 0" }}>
          {visibleAccounts.length} of {users.length} user accounts shown. Results are limited to your authorized user directory.
        </p>
      </div>

      {error && (
        <ErrorBox
          message={
            error
          }
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
        ) : users.length ===
          0 ? (
          <EmptyMessage
            message="No CHRIS users found."
          />
        ) : (
          <div
            style={{
              overflowX:
                "auto",
            }}
          >
            <table
              style={
                tableStyle
              }
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

                  {canManage && (
                    <TableHeader>
                      Actions
                    </TableHeader>
                  )}
                </tr>
              </thead>

              <tbody>
                {visibleAccounts.map(
                  (user) => {
                    const isCurrentUser =
                      user.id ===
                      currentUserId;

                    const statusUpdating =
                      statusUpdatingUserId ===
                      user.id;

                    return (
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

                            {isCurrentUser && (
                              <span
                                style={
                                  youBadgeStyle
                                }
                              >
                                You
                              </span>
                            )}
                          </div>

                          {user.employee
                            ?.employeeNumber && (
                            <div
                              style={{
                                marginTop:
                                  "4px",

                                color:
                                  "#94A3B8",

                                fontSize:
                                  "10px",

                                fontWeight:
                                  "700",
                              }}
                            >
                              {
                                user
                                  .employee
                                  .employeeNumber
                              }
                            </div>
                          )}
                        </TableCell>

                        <TableCell>
                          {
                            user.email
                          }
                        </TableCell>

                        <TableCell>
                          <div
                            style={{
                              display:
                                "flex",

                              gap:
                                "6px",

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
                          {user.accessSuspendedAt ? <span style={{fontWeight:700,color:"#b45309"}}>Suspended</span> : <StatusBadge active={user.isActive} />}
                        </TableCell>

                        <TableCell>
                          {formatDate(
                            user.createdAt
                          )}
                        </TableCell>

                        {canManage && (
                          <TableCell>
                            <div
                              style={{
                                display:
                                  "flex",

                                alignItems:
                                  "center",

                                gap:
                                  "7px",

                                flexWrap:
                                  "wrap",
                              }}
                            >
                              {!isCurrentUser && <>
                                <button type="button" disabled={!user.isActive || Boolean(user.accessSuspendedAt) || recoveryUserId === user.id}
                                  onClick={()=>onSendRecovery(user,"admin")} style={editButtonStyle}>Reset Staff Password</button>
                                <button type="button" disabled={!user.isActive || Boolean(user.accessSuspendedAt) || !user.employeeId || recoveryUserId === user.id}
                                  onClick={()=>onSendRecovery(user,"ess")} style={editButtonStyle}>Reset ESS Password</button>
                                <button type="button" disabled={!user.isActive || recoveryUserId === user.id}
                                  onClick={()=>onSuspension(user)}
                                  style={user.accessSuspendedAt ? activateButtonStyle : deactivateButtonStyle}>
                                  {user.accessSuspendedAt ? "Resume Access" : "Suspend Access"}
                                </button>
                              </>}
                              <button
                                type="button"

                                onClick={() =>
                                  onEditUser(
                                    user
                                  )
                                }

                                disabled={
                                  isCurrentUser
                                }

                                title={
                                  isCurrentUser
                                    ? "Your own roles cannot be changed here."
                                    : "Edit user"
                                }

                                style={{
                                  ...editButtonStyle,

                                  opacity:
                                    isCurrentUser
                                      ? 0.45
                                      : 1,

                                  cursor:
                                    isCurrentUser
                                      ? "not-allowed"
                                      : "pointer",
                                }}
                              >
                                <FaEdit />

                                Edit
                              </button>

                              <button
                                type="button"

                                onClick={() =>
                                  onStatusChange(
                                    user
                                  )
                                }

                                disabled={
                                  statusUpdating ||
                                  (isCurrentUser &&
                                    user.isActive)
                                }

                                style={{
                                  ...(user.isActive
                                    ? deactivateButtonStyle
                                    : activateButtonStyle),

                                  opacity:
                                    statusUpdating ||
                                    (isCurrentUser &&
                                      user.isActive)
                                      ? 0.45
                                      : 1,

                                  cursor:
                                    statusUpdating ||
                                    (isCurrentUser &&
                                      user.isActive)
                                      ? "not-allowed"
                                      : "pointer",
                                }}
                              >
                                {user.isActive ? (
                                  <FaToggleOff />
                                ) : (
                                  <FaToggleOn />
                                )}

                                {statusUpdating
                                  ? "Updating..."
                                  : user.isActive
                                    ? "Deactivate"
                                    : "Activate"}
                              </button>
                            </div>
                          </TableCell>
                        )}
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/*
============================================================
ROLES TAB
============================================================
*/
function RolesTab({
  roles,
  loading,
  error,
  canView,
  canManage,
  selectedRole,
  showCreateRole,
  onCreateRole,
  onRoleCreated,
  onCancelCreateRole,
  onSelectRole,
  onCloseRole,
  onSaved,
}) {
  if (!canView) {
    return (
      <AccessNotice
        message="You do not have permission to view CHRIS roles."
      />
    );
  }

  if (showCreateRole && canManage) {
    return (
      <div>
        <CreateRoleForm
          onCancel={onCancelCreateRole}
          onCreated={onRoleCreated}
        />
      </div>
    );
  }

  if (selectedRole) {
    return (
      <div>
        <button
          type="button"

          onClick={
            onCloseRole
          }

          style={
            backButtonStyle
          }
        >
          ← Back to Roles
        </button>

        <RolePermissionsEditor
          role={
            selectedRole
          }

          canManage={
            canManage
          }

          onCancel={
            onCloseRole
          }

          onSaved={
            onSaved
          }
        />
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",

          justifyContent:
            "space-between",

          alignItems:
            "center",

          gap: "16px",

          marginBottom:
            "18px",

          flexWrap:
            "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,

              color:
                "#0F172A",

              fontSize:
                "20px",

              fontWeight:
                "800",
            }}
          >
            Roles & Permissions
          </h2>

          <p
            style={{
              margin:
                "5px 0 0",

              color:
                "#64748B",

              fontSize:
                "13px",
            }}
          >
            Organization roles
            and their
            authorization scope.
          </p>
        </div>

        {canManage ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={manageBadgeStyle}>
              Role Management Enabled
            </span>
            <button
              type="button"
              onClick={onCreateRole}
              style={createButtonStyle}
            >
              + Create Role
            </button>
          </div>
        ) : (
          <span
            style={
              viewOnlyBadgeStyle
            }
          >
            View Only
          </span>
        )}
      </div>

      {error && (
        <ErrorBox
          message={
            error
          }
        />
      )}

      {loading ? (
        <LoadingMessage
          message="Loading CHRIS roles..."
        />
      ) : roles.length ===
        0 ? (
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
            (role) => {
              const administrator =
                role.name ===
                "Administrator";

              const buttonLabel =
                administrator ||
                !canManage
                  ? "View Permissions"
                  : "Manage Permissions";

              return (
                <div
                  key={
                    role.id
                  }

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

                      gap:
                        "12px",

                      alignItems:
                        "flex-start",
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin:
                            0,

                          color:
                            "#087A43",

                          fontSize:
                            "17px",

                          fontWeight:
                            "800",
                        }}
                      >
                        {
                          role.name
                        }
                      </h3>

                      <div
                        style={{
                          display:
                            "flex",

                          gap:
                            "6px",

                          flexWrap:
                            "wrap",
                        }}
                      >
                        {role.isSystemRole && (
                          <span
                            style={
                              systemRoleBadgeStyle
                            }
                          >
                            SYSTEM ROLE
                          </span>
                        )}

                        {administrator && (
                          <span
                            style={
                              protectedRoleBadgeStyle
                            }
                          >
                            PROTECTED
                          </span>
                        )}
                      </div>
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

                      gap:
                        "12px",
                    }}
                  >
                    <RoleMetric
                      className="chris-role-metric"
                      label="Users"
                      value={
                        role.userCount ??
                        0
                      }
                    />

                    <RoleMetric
                      className="chris-role-metric"
                      label="Permissions"
                      value={
                        role.permissionCount ??
                        0
                      }
                    />
                  </div>

                  <button
                    type="button"

                    onClick={() =>
                      onSelectRole(
                        role
                      )
                    }

                    className={`chris-role-action ${administrator || role.isSystemRole || !canManage ? "is-view" : "is-edit"}`}
                    style={{
                      ...roleActionButtonStyle,

                      background:
                        administrator ||
                        !canManage
                          ? "#FFFFFF"
                          : "#087A43",

                      color:
                        administrator ||
                        !canManage
                          ? "#475569"
                          : "#FFFFFF",

                      border:
                        administrator ||
                        !canManage
                          ? "1px solid #CBD5E1"
                          : "1px solid #087A43",
                    }}
                  >
                    {administrator || role.isSystemRole || !canManage ? "View Permissions" : "Edit Role & Permissions"}
                  </button>
                </div>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}

/*
============================================================
SHARED COMPONENTS
============================================================
*/

function SummaryCard({
  icon,
  title,
  value,
  subtitle,
}) {
  return (
    <div
      style={{
        background:
          "#FFFFFF",

        border:
          "1px solid #E5E7EB",

        borderRadius:
          "16px",

        padding:
          "20px",

        boxShadow:
          "0 6px 20px rgba(15,23,42,0.05)",
      }}
    >
      <div
        style={{
          display: "flex",

          alignItems:
            "center",

          justifyContent:
            "space-between",

          marginBottom:
            "14px",
        }}
      >
        <span
          style={{
            color:
              "#087A43",

            fontSize:
              "20px",
          }}
        >
          {icon}
        </span>

        <span
          style={{
            color:
              "#94A3B8",

            fontSize:
              "11px",

            fontWeight:
              "800",

            textTransform:
              "uppercase",
          }}
        >
          {title}
        </span>
      </div>

      <div
        style={{
          color:
            "#087A43",

          fontSize:
            "30px",

          fontWeight:
            "800",
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop:
            "6px",

          color:
            "#94A3B8",

          fontSize:
            "12px",
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

      onClick={
        onClick
      }

      style={{
        border:
          "none",

        borderBottom:
          active
            ? "3px solid #087A43"
            : "3px solid transparent",

        background:
          "transparent",

        padding:
          "12px 16px",

        color:
          active
            ? "#087A43"
            : "#64748B",

        fontSize:
          "14px",

        fontWeight:
          "800",

        cursor:
          "pointer",
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
        display:
          "inline-block",

        padding:
          "5px 9px",

        borderRadius:
          "20px",

        background:
          active
            ? "#ECFDF5"
            : "#FEF2F2",

        color:
          active
            ? "#047857"
            : "#B91C1C",

        fontSize:
          "11px",

        fontWeight:
          "800",
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
  className = "",
}) {
  return (
    <div
      className={className}
      style={{
        padding:
          "12px",

        background:
          "#F8FAFC",

        borderRadius:
          "10px",

        border:
          "1px solid #E2E8F0",
      }}
    >
      <div
        style={{
          color:
            "#087A43",

          fontSize:
            "20px",

          fontWeight:
            "800",
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop:
            "4px",

          color:
            "#64748B",

          fontSize:
            "11px",

          fontWeight:
            "700",
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
        textAlign:
          "left",

        padding:
          "14px 16px",

        background:
          "#F8FAFC",

        color:
          "#475569",

        fontSize:
          "12px",

        fontWeight:
          "800",

        textTransform:
          "uppercase",

        letterSpacing:
          "0.03em",

        whiteSpace:
          "nowrap",
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
        padding:
          "15px 16px",

        color:
          "#475569",

        fontSize:
          "13px",

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
    <div
      style={
        errorStyle
      }
    >
      {message}
    </div>
  );
}

function LoadingMessage({
  message,
}) {
  return (
    <div
      style={
        messageStyle
      }
    >
      {message}
    </div>
  );
}

function EmptyMessage({
  message,
}) {
  return (
    <div
      style={
        messageStyle
      }
    >
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
        padding:
          "20px",

        background:
          "#FEF2F2",

        border:
          "1px solid #FECACA",

        borderRadius:
          "12px",

        color:
          "#991B1B",

        fontSize:
          "14px",

        fontWeight:
          "600",
      }}
    >
      {message}
    </div>
  );
}

function getUserName(
  user
) {
  const employee = user?.employee || null;
  const fullName = [
    employee?.firstName || user.firstName,
    employee?.middleName,
    employee?.lastName || user.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    fullName ||
    "Unnamed User"
  );
}

function formatDate(
  value
) {
  if (!value) {
    return "—";
  }

  return new Date(
    value
  ).toLocaleDateString();
}

/*
============================================================
STYLES
============================================================
*/

const createButtonStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "8px",

  padding:
    "11px 16px",

  background:
    "#087A43",

  color:
    "#FFFFFF",

  border:
    "none",

  borderRadius:
    "9px",

  fontSize:
    "13px",

  fontWeight:
    "800",

  cursor:
    "pointer",

  boxShadow:
    "0 5px 14px rgba(11,94,59,0.18)",
};

const editButtonStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "5px",

  padding:
    "7px 10px",

  background:
    "#EFF6FF",

  border:
    "1px solid #BFDBFE",

  borderRadius:
    "7px",

  color:
    "#1D4ED8",

  fontSize:
    "11px",

  fontWeight:
    "800",
};

const deactivateButtonStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "5px",

  padding:
    "7px 10px",

  background:
    "#FEF2F2",

  border:
    "1px solid #FECACA",

  borderRadius:
    "7px",

  color:
    "#B91C1C",

  fontSize:
    "11px",

  fontWeight:
    "800",
};

const activateButtonStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "5px",

  padding:
    "7px 10px",

  background:
    "#ECFDF5",

  border:
    "1px solid #A7F3D0",

  borderRadius:
    "7px",

  color:
    "#047857",

  fontSize:
    "11px",

  fontWeight:
    "800",
};

const youBadgeStyle = {
  display:
    "inline-block",

  marginLeft:
    "7px",

  padding:
    "2px 6px",

  background:
    "#FFF7ED",

  border:
    "1px solid #FED7AA",

  borderRadius:
    "10px",

  color:
    "#C2410C",

  fontSize:
    "9px",

  fontWeight:
    "800",

  verticalAlign:
    "middle",
};

const tableContainerStyle = {
  background:
    "#FFFFFF",

  border:
    "1px solid #E5E7EB",

  borderRadius:
    "14px",

  overflow:
    "hidden",

  boxShadow:
    "0 6px 20px rgba(15,23,42,0.04)",
};

const tableStyle = {
  width:
    "100%",

  borderCollapse:
    "collapse",
};

const roleBadgeStyle = {
  display:
    "inline-block",

  padding:
    "4px 8px",

  background:
    "#EFF6FF",

  color:
    "#1D4ED8",

  borderRadius:
    "20px",

  fontSize:
    "10px",

  fontWeight:
    "800",
};

const manageBadgeStyle = {
  display:
    "inline-block",

  padding:
    "6px 10px",

  background:
    "#ECFDF5",

  border:
    "1px solid #A7F3D0",

  borderRadius:
    "20px",

  color:
    "#047857",

  fontSize:
    "11px",

  fontWeight:
    "800",
};

const viewOnlyBadgeStyle = {
  display:
    "inline-block",

  padding:
    "6px 10px",

  background:
    "#EFF6FF",

  border:
    "1px solid #BFDBFE",

  borderRadius:
    "20px",

  color:
    "#1D4ED8",

  fontSize:
    "11px",

  fontWeight:
    "800",
};

const systemRoleBadgeStyle = {
  display:
    "inline-block",

  marginTop:
    "7px",

  padding:
    "4px 8px",

  background:
    "#ECFDF5",

  color:
    "#047857",

  border:
    "1px solid #A7F3D0",

  borderRadius:
    "20px",

  fontSize:
    "10px",

  fontWeight:
    "800",
};

const protectedRoleBadgeStyle = {
  display:
    "inline-block",

  marginTop:
    "7px",

  padding:
    "4px 8px",

  background:
    "#FFF7ED",

  color:
    "#C2410C",

  border:
    "1px solid #FED7AA",

  borderRadius:
    "20px",

  fontSize:
    "10px",

  fontWeight:
    "800",
};

const roleCardStyle = {
  background:
    "var(--chris-ui-panel-background, #FFFFFF)",

  border:
    "var(--chris-ui-panel-border, 1px solid #E5E7EB)",

  borderRadius:
    "var(--chris-ui-panel-radius, 14px)",

  padding:
    "20px",

  boxShadow:
    "var(--chris-ui-panel-shadow, 0 6px 20px rgba(15,23,42,0.04))",
};

const roleActionButtonStyle = {
  width:
    "100%",

  marginTop:
    "16px",

  padding:
    "10px 12px",

  borderRadius:
    "9px",

  fontSize:
    "12px",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

const backButtonStyle = {
  marginBottom:
    "16px",

  padding:
    "8px 12px",

  border:
    "1px solid #CBD5E1",

  borderRadius:
    "8px",

  background:
    "#FFFFFF",

  color:
    "#475569",

  fontSize:
    "12px",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

const errorStyle = {
  marginBottom:
    "18px",

  padding:
    "14px 16px",

  background:
    "#FEF2F2",

  border:
    "1px solid #FECACA",

  borderRadius:
    "10px",

  color:
    "#B91C1C",

  fontSize:
    "13px",

  fontWeight:
    "600",
};

const successStyle = {
  marginBottom:
    "18px",

  padding:
    "14px 16px",

  background:
    "#ECFDF5",

  border:
    "1px solid #A7F3D0",

  borderRadius:
    "10px",

  color:
    "#047857",

  fontSize:
    "13px",

  fontWeight:
    "700",
};

const messageStyle = {
  padding:
    "28px",

  textAlign:
    "center",

  color:
    "#64748B",

  fontSize:
    "14px",
};

export default UsersRolesSettings;