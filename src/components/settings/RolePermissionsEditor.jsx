import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FaCheck,
  FaLock,
  FaSave,
  FaTimes,
  FaUserShield,
} from "react-icons/fa";

import {
  apiRequest,
} from "../../services/api";

function RolePermissionsEditor({
  role,
  canManage,
  onCancel,
  onSaved,
}) {
  const [
    allPermissions,
    setAllPermissions,
  ] = useState([]);

  const [
    selectedPermissionIds,
    setSelectedPermissionIds,
  ] = useState([]);

  const [
    originalPermissionIds,
    setOriginalPermissionIds,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    saveSuccess,
    setSaveSuccess,
  ] = useState(false);

  /*
  ============================================================
  ACCESS MODE
  ============================================================
  */

  const isAdministrator =
    role?.name ===
    "Administrator";

  const isReadOnly =
    isAdministrator ||
    !canManage;

  /*
  ============================================================
  LOAD PERMISSIONS
  ============================================================
  */
  useEffect(() => {
    if (!role?.id) {
      return;
    }

    let cancelled = false;

    const loadData =
      async () => {
        try {
          setLoading(true);
          setError("");
          setSaveSuccess(false);

          const [
            permissionResult,
            roleResult,
          ] = await Promise.all([
            apiRequest(
              "/api/roles/permissions"
            ),

            apiRequest(
              `/api/roles/${role.id}`
            ),
          ]);

          if (cancelled) {
            return;
          }

          const permissions =
            permissionResult.data ||
            [];

          const rolePermissions =
            roleResult.data
              ?.permissions ||
            [];

          const assignedIds =
            rolePermissions.map(
              (permission) =>
                permission.id
            );

          setAllPermissions(
            permissions
          );

          setSelectedPermissionIds(
            assignedIds
          );

          setOriginalPermissionIds(
            assignedIds
          );
        } catch (
          requestError
        ) {
          console.error(
            "Role permission load error:",
            requestError
          );

          if (!cancelled) {
            setError(
              requestError.message ||
                "Unable to load CHRIS role permissions."
            );
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [role?.id]);

  /*
  ============================================================
  GROUP PERMISSIONS BY MODULE
  ============================================================
  */
  const groupedPermissions =
    useMemo(() => {
      const groups = {};

      for (
        const permission of
        allPermissions
      ) {
        const moduleName =
          permission.key
            ?.split(".")[0] ||
          "other";

        if (!groups[moduleName]) {
          groups[moduleName] = [];
        }

        groups[
          moduleName
        ].push(
          permission
        );
      }

      return Object.entries(
        groups
      )
        .sort(
          ([a], [b]) =>
            a.localeCompare(b)
        )
        .map(
          ([
            moduleName,
            permissions,
          ]) => ({
            moduleName,

            permissions:
              [...permissions].sort(
                (a, b) =>
                  a.key.localeCompare(
                    b.key
                  )
              ),
          })
        );
    }, [allPermissions]);

  /*
  ============================================================
  UNSAVED CHANGE DETECTION
  ============================================================
  */
  const hasUnsavedChanges =
    useMemo(() => {
      if (
        selectedPermissionIds.length !==
        originalPermissionIds.length
      ) {
        return true;
      }

      const originalSet =
        new Set(
          originalPermissionIds
        );

      return selectedPermissionIds.some(
        (id) =>
          !originalSet.has(id)
      );
    }, [
      selectedPermissionIds,
      originalPermissionIds,
    ]);

  /*
  ============================================================
  SINGLE PERMISSION TOGGLE
  ============================================================
  */
  const togglePermission =
    (permissionId) => {
      if (
        isReadOnly ||
        saving
      ) {
        return;
      }

      setSelectedPermissionIds(
        (current) => {
          const selected =
            current.includes(
              permissionId
            );

          if (selected) {
            return current.filter(
              (id) =>
                id !==
                permissionId
            );
          }

          return [
            ...current,
            permissionId,
          ];
        }
      );

      setError("");
      setSaveSuccess(false);
    };

  /*
  ============================================================
  SELECT MODULE
  ============================================================
  */
  const selectModule =
    (permissions) => {
      if (
        isReadOnly ||
        saving
      ) {
        return;
      }

      const moduleIds =
        permissions.map(
          (permission) =>
            permission.id
        );

      setSelectedPermissionIds(
        (current) => [
          ...new Set([
            ...current,
            ...moduleIds,
          ]),
        ]
      );

      setError("");
      setSaveSuccess(false);
    };

  /*
  ============================================================
  CLEAR MODULE
  ============================================================
  */
  const clearModule =
    (permissions) => {
      if (
        isReadOnly ||
        saving
      ) {
        return;
      }

      const moduleIds =
        new Set(
          permissions.map(
            (permission) =>
              permission.id
          )
        );

      setSelectedPermissionIds(
        (current) =>
          current.filter(
            (id) =>
              !moduleIds.has(id)
          )
      );

      setError("");
      setSaveSuccess(false);
    };

  /*
  ============================================================
  SAVE PERMISSIONS
  ============================================================
  */
  const handleSave =
    async () => {
      if (!role?.id) {
        return;
      }

      if (isAdministrator) {
        setError(
          "Administrator permissions are protected and cannot be modified."
        );

        return;
      }

      if (!canManage) {
        setError(
          "You do not have permission to modify CHRIS role assignments."
        );

        return;
      }

      if (
        !hasUnsavedChanges
      ) {
        return;
      }

      try {
        setSaving(true);
        setError("");
        setSaveSuccess(false);

        const result =
          await apiRequest(
            `/api/roles/${role.id}/permissions`,
            {
              method: "PUT",

              body:
                JSON.stringify({
                  permissionIds:
                    selectedPermissionIds,
                }),
            }
          );

        /*
        --------------------------------------------------------
        Mark the currently selected permissions as the new
        saved baseline.
        --------------------------------------------------------
        */
        setOriginalPermissionIds(
          [
            ...selectedPermissionIds,
          ]
        );

        setSaveSuccess(true);

        if (onSaved) {
          await onSaved(
            result.data
          );
        }
      } catch (
        requestError
      ) {
        console.error(
          "Role permission save error:",
          requestError
        );

        setError(
          requestError.message ||
            "Unable to update CHRIS role permissions."
        );

        setSaveSuccess(false);
      } finally {
        setSaving(false);
      }
    };

  /*
  ============================================================
  CANCEL / CLOSE
  ============================================================
  */
  const handleCancel =
    () => {
      if (
        saving
      ) {
        return;
      }

      if (
        hasUnsavedChanges
      ) {
        const confirmed =
          window.confirm(
            "You have unsaved permission changes. Close without saving?"
          );

        if (!confirmed) {
          return;
        }
      }

      onCancel();
    };

  const selectedCount =
    selectedPermissionIds.length;

  if (!role) {
    return null;
  }

  return (
    <div
      style={{
        background:
          "#FFFFFF",

        border:
          "1px solid #E5E7EB",

        borderRadius:
          "16px",

        boxShadow:
          "0 12px 32px rgba(15,23,42,0.08)",

        overflow:
          "hidden",

        marginBottom:
          "24px",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: "flex",

          justifyContent:
            "space-between",

          alignItems:
            "flex-start",

          gap: "18px",

          padding:
            "20px 22px",

          background:
            "#F8FAFC",

          borderBottom:
            "1px solid #E5E7EB",
        }}
      >
        <div
          style={{
            display: "flex",

            alignItems:
              "flex-start",

            gap: "13px",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",

              flexShrink: 0,

              display: "flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              borderRadius:
                "10px",

              background:
                "#ECFDF5",

              color:
                "#0B5E3B",

              fontSize:
                "18px",
            }}
          >
            <FaUserShield />
          </div>

          <div>
            <div
              style={{
                display: "flex",

                alignItems:
                  "center",

                gap: "9px",

                flexWrap:
                  "wrap",
              }}
            >
              <h3
                style={{
                  margin: 0,

                  color:
                    "#0F172A",

                  fontSize:
                    "19px",

                  fontWeight:
                    "800",
                }}
              >
                {role.name}
              </h3>

              {role.isSystemRole && (
                <span
                  style={
                    systemBadgeStyle
                  }
                >
                  SYSTEM ROLE
                </span>
              )}

              {isAdministrator && (
                <span
                  style={
                    protectedBadgeStyle
                  }
                >
                  <FaLock />

                  Protected
                </span>
              )}

              {!isAdministrator &&
                !canManage && (
                  <span
                    style={
                      readOnlyBadgeStyle
                    }
                  >
                    <FaLock />

                    View Only
                  </span>
                )}
            </div>

            <p
              style={{
                margin:
                  "5px 0 0",

                color:
                  "#64748B",

                fontSize:
                  "12px",

                lineHeight:
                  1.5,
              }}
            >
              {role.description ||
                "Manage authorization permissions for this CHRIS role."}
            </p>
          </div>
        </div>

        <button
          type="button"

          onClick={
            handleCancel
          }

          disabled={
            saving
          }

          title="Close"

          style={{
            border:
              "none",

            background:
              "transparent",

            color:
              "#64748B",

            cursor:
              saving
                ? "not-allowed"
                : "pointer",

            fontSize:
              "18px",

            padding:
              "8px",
          }}
        >
          <FaTimes />
        </button>
      </div>

      <div
        style={{
          padding:
            "22px",
        }}
      >
        {error && (
          <div
            style={
              errorStyle
            }
          >
            {error}
          </div>
        )}

        {isAdministrator && (
          <div
            style={
              administratorNoticeStyle
            }
          >
            <FaLock />

            <div>
              <strong>
                Administrator access is protected.
              </strong>

              <div
                style={{
                  marginTop:
                    "3px",

                  fontSize:
                    "11px",

                  lineHeight:
                    1.5,
                }}
              >
                Administrator retains
                complete CHRIS access.
                Its permission set is
                view-only to prevent
                accidental administrative
                lockout.
              </div>
            </div>
          </div>
        )}

        {!isAdministrator &&
          !canManage && (
            <div
              style={
                readOnlyNoticeStyle
              }
            >
              <FaLock />

              <div>
                <strong>
                  Permission assignments
                  are view-only.
                </strong>

                <div
                  style={{
                    marginTop:
                      "3px",

                    fontSize:
                      "11px",

                    lineHeight:
                      1.5,
                  }}
                >
                  Your account can view
                  role permissions but
                  does not have
                  roles.manage access.
                </div>
              </div>
            </div>
          )}

        {/* SUMMARY */}
        <div
          style={{
            display: "flex",

            justifyContent:
              "space-between",

            alignItems:
              "center",

            gap: "14px",

            flexWrap:
              "wrap",

            marginBottom:
              "20px",
          }}
        >
          <div>
            <div
              style={{
                color:
                  "#334155",

                fontSize:
                  "13px",

                fontWeight:
                  "800",
              }}
            >
              Permission Assignment
            </div>

            <div
              style={{
                marginTop:
                  "4px",

                color:
                  "#64748B",

                fontSize:
                  "11px",
              }}
            >
              Review the capabilities
              users with this role can
              access.
            </div>
          </div>

          <div
            style={{
              padding:
                "8px 12px",

              background:
                "#F8FAFC",

              border:
                "1px solid #E2E8F0",

              borderRadius:
                "999px",

              color:
                "#0B5E3B",

              fontSize:
                "12px",

              fontWeight:
                "800",
            }}
          >
            {loading
              ? "Loading..."
              : `${selectedCount} of ${allPermissions.length} permissions`}
          </div>
        </div>

        {loading ? (
          <div
            style={
              messageStyle
            }
          >
            Loading role permissions...
          </div>
        ) : groupedPermissions.length ===
          0 ? (
          <div
            style={
              messageStyle
            }
          >
            No CHRIS permissions are
            available.
          </div>
        ) : (
          <div
            style={{
              display:
                "grid",

              gap:
                "16px",
            }}
          >
            {groupedPermissions.map(
              ({
                moduleName,
                permissions,
              }) => {
                const selectedInModule =
                  permissions.filter(
                    (permission) =>
                      selectedPermissionIds.includes(
                        permission.id
                      )
                  ).length;

                const allSelected =
                  selectedInModule ===
                  permissions.length;

                return (
                  <div
                    key={
                      moduleName
                    }

                    style={
                      moduleCardStyle
                    }
                  >
                    {/* MODULE HEADER */}
                    <div
                      style={{
                        display:
                          "flex",

                        justifyContent:
                          "space-between",

                        alignItems:
                          "center",

                        gap:
                          "12px",

                        flexWrap:
                          "wrap",

                        padding:
                          "14px 16px",

                        background:
                          "#F8FAFC",

                        borderBottom:
                          "1px solid #E5E7EB",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            color:
                              "#0B5E3B",

                            fontSize:
                              "14px",

                            fontWeight:
                              "800",

                            textTransform:
                              "capitalize",
                          }}
                        >
                          {
                            moduleName
                          }
                        </div>

                        <div
                          style={{
                            marginTop:
                              "3px",

                            color:
                              "#94A3B8",

                            fontSize:
                              "10px",
                          }}
                        >
                          {
                            selectedInModule
                          }{" "}
                          of{" "}
                          {
                            permissions.length
                          }{" "}
                          selected
                        </div>
                      </div>

                      {!isReadOnly && (
                        <div
                          style={{
                            display:
                              "flex",

                            gap:
                              "7px",

                            flexWrap:
                              "wrap",
                          }}
                        >
                          <button
                            type="button"

                            onClick={() =>
                              selectModule(
                                permissions
                              )
                            }

                            disabled={
                              saving ||
                              allSelected
                            }

                            style={{
                              ...moduleActionButtonStyle,

                              opacity:
                                saving ||
                                allSelected
                                  ? 0.55
                                  : 1,
                            }}
                          >
                            Select All
                          </button>

                          <button
                            type="button"

                            onClick={() =>
                              clearModule(
                                permissions
                              )
                            }

                            disabled={
                              saving ||
                              selectedInModule ===
                                0
                            }

                            style={{
                              ...moduleActionButtonStyle,

                              opacity:
                                saving ||
                                selectedInModule ===
                                  0
                                  ? 0.55
                                  : 1,
                            }}
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>

                    {/* PERMISSIONS */}
                    <div
                      style={{
                        display:
                          "grid",

                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(240px, 1fr))",

                        gap:
                          "10px",

                        padding:
                          "14px",
                      }}
                    >
                      {permissions.map(
                        (
                          permission
                        ) => {
                          const selected =
                            selectedPermissionIds.includes(
                              permission.id
                            );

                          return (
                            <label
                              key={
                                permission.id
                              }

                              style={{
                                display:
                                  "flex",

                                alignItems:
                                  "flex-start",

                                gap:
                                  "10px",

                                padding:
                                  "12px",

                                border:
                                  selected
                                    ? "1px solid #86EFAC"
                                    : "1px solid #E2E8F0",

                                borderRadius:
                                  "10px",

                                background:
                                  selected
                                    ? "#F0FDF4"
                                    : "#FFFFFF",

                                cursor:
                                  isReadOnly ||
                                  saving
                                    ? "default"
                                    : "pointer",

                                opacity:
                                  saving
                                    ? 0.7
                                    : 1,
                              }}
                            >
                              <input
                                type="checkbox"

                                checked={
                                  selected
                                }

                                disabled={
                                  isReadOnly ||
                                  saving
                                }

                                onChange={() =>
                                  togglePermission(
                                    permission.id
                                  )
                                }

                                style={{
                                  marginTop:
                                    "3px",
                                }}
                              />

                              <span>
                                <span
                                  style={{
                                    display:
                                      "flex",

                                    alignItems:
                                      "center",

                                    gap:
                                      "6px",

                                    color:
                                      "#0F172A",

                                    fontSize:
                                      "12px",

                                    fontWeight:
                                      "800",
                                  }}
                                >
                                  {
                                    permission.name
                                  }

                                  {selected && (
                                    <FaCheck
                                      style={{
                                        color:
                                          "#059669",

                                        fontSize:
                                          "9px",
                                      }}
                                    />
                                  )}
                                </span>

                                <span
                                  style={{
                                    display:
                                      "block",

                                    marginTop:
                                      "3px",

                                    color:
                                      "#64748B",

                                    fontSize:
                                      "10px",

                                    lineHeight:
                                      1.45,
                                  }}
                                >
                                  {
                                    permission.description
                                  }
                                </span>

                                <span
                                  style={{
                                    display:
                                      "inline-block",

                                    marginTop:
                                      "6px",

                                    padding:
                                      "3px 6px",

                                    background:
                                      "#F1F5F9",

                                    borderRadius:
                                      "5px",

                                    color:
                                      "#64748B",

                                    fontSize:
                                      "9px",

                                    fontFamily:
                                      "monospace",
                                  }}
                                >
                                  {
                                    permission.key
                                  }
                                </span>
                              </span>
                            </label>
                          );
                        }
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}

        {/* SAVE STATUS */}
        {!isReadOnly && (
          <div
            style={{
              marginTop:
                "22px",
            }}
          >
            {saving && (
              <div
                style={
                  savingStatusStyle
                }
              >
                Saving permissions...
              </div>
            )}

            {!saving &&
              saveSuccess && (
                <div
                  style={
                    saveSuccessStyle
                  }
                >
                  <FaCheck />

                  Permissions saved successfully.
                </div>
              )}

            {!saving &&
              !saveSuccess &&
              hasUnsavedChanges && (
                <div
                  style={
                    unsavedStatusStyle
                  }
                >
                  Unsaved changes
                </div>
              )}

            {!saving &&
              !saveSuccess &&
              !hasUnsavedChanges && (
                <div
                  style={
                    savedStatusStyle
                  }
                >
                  <FaCheck />

                  All changes saved
                </div>
              )}
          </div>
        )}

        {/* ACTIONS */}
        <div
          style={{
            display: "flex",

            justifyContent:
              "flex-end",

            gap: "10px",

            flexWrap:
              "wrap",

            marginTop:
              "12px",

            paddingTop:
              "18px",

            borderTop:
              "1px solid #E5E7EB",
          }}
        >
          <button
            type="button"

            onClick={
              handleCancel
            }

            disabled={
              saving
            }

            style={{
              ...cancelButtonStyle,

              opacity:
                saving
                  ? 0.55
                  : 1,

              cursor:
                saving
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            <FaTimes />

            {saveSuccess ||
            isReadOnly
              ? "Close"
              : "Cancel"}
          </button>

          {!isReadOnly &&
            !saveSuccess && (
              <button
                type="button"

                onClick={
                  handleSave
                }

                disabled={
                  loading ||
                  saving ||
                  !hasUnsavedChanges
                }

                style={{
                  ...saveButtonStyle,

                  opacity:
                    loading ||
                    saving ||
                    !hasUnsavedChanges
                      ? 0.55
                      : 1,

                  cursor:
                    loading ||
                    saving ||
                    !hasUnsavedChanges
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                <FaSave />

                {saving
                  ? "Saving..."
                  : "Save Permissions"}
              </button>
            )}
        </div>
      </div>
    </div>
  );
}

/*
============================================================
STYLES
============================================================
*/

const moduleCardStyle = {
  border:
    "1px solid #E2E8F0",

  borderRadius:
    "12px",

  overflow:
    "hidden",

  background:
    "#FFFFFF",
};

const moduleActionButtonStyle = {
  border:
    "1px solid #CBD5E1",

  background:
    "#FFFFFF",

  color:
    "#475569",

  borderRadius:
    "7px",

  padding:
    "6px 9px",

  fontSize:
    "10px",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

const systemBadgeStyle = {
  display:
    "inline-block",

  padding:
    "4px 7px",

  background:
    "#ECFDF5",

  border:
    "1px solid #A7F3D0",

  borderRadius:
    "999px",

  color:
    "#047857",

  fontSize:
    "9px",

  fontWeight:
    "800",
};

const protectedBadgeStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "5px",

  padding:
    "4px 7px",

  background:
    "#FFF7ED",

  border:
    "1px solid #FED7AA",

  borderRadius:
    "999px",

  color:
    "#C2410C",

  fontSize:
    "9px",

  fontWeight:
    "800",
};

const readOnlyBadgeStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "5px",

  padding:
    "4px 7px",

  background:
    "#EFF6FF",

  border:
    "1px solid #BFDBFE",

  borderRadius:
    "999px",

  color:
    "#1D4ED8",

  fontSize:
    "9px",

  fontWeight:
    "800",
};

const administratorNoticeStyle = {
  display:
    "flex",

  alignItems:
    "flex-start",

  gap:
    "10px",

  marginBottom:
    "18px",

  padding:
    "13px 14px",

  border:
    "1px solid #FED7AA",

  borderRadius:
    "10px",

  background:
    "#FFF7ED",

  color:
    "#9A3412",

  fontSize:
    "12px",
};

const readOnlyNoticeStyle = {
  display:
    "flex",

  alignItems:
    "flex-start",

  gap:
    "10px",

  marginBottom:
    "18px",

  padding:
    "13px 14px",

  border:
    "1px solid #BFDBFE",

  borderRadius:
    "10px",

  background:
    "#EFF6FF",

  color:
    "#1E40AF",

  fontSize:
    "12px",
};

const unsavedStatusStyle = {
  padding:
    "11px 14px",

  background:
    "#FFFBEB",

  border:
    "1px solid #FDE68A",

  borderRadius:
    "9px",

  color:
    "#92400E",

  fontSize:
    "12px",

  fontWeight:
    "800",
};

const savingStatusStyle = {
  padding:
    "11px 14px",

  background:
    "#EFF6FF",

  border:
    "1px solid #BFDBFE",

  borderRadius:
    "9px",

  color:
    "#1D4ED8",

  fontSize:
    "12px",

  fontWeight:
    "800",
};

const saveSuccessStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "8px",

  padding:
    "11px 14px",

  background:
    "#ECFDF5",

  border:
    "1px solid #A7F3D0",

  borderRadius:
    "9px",

  color:
    "#047857",

  fontSize:
    "12px",

  fontWeight:
    "800",
};

const savedStatusStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "8px",

  padding:
    "11px 14px",

  background:
    "#F8FAFC",

  border:
    "1px solid #E2E8F0",

  borderRadius:
    "9px",

  color:
    "#64748B",

  fontSize:
    "12px",

  fontWeight:
    "700",
};

const cancelButtonStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "7px",

  padding:
    "11px 16px",

  border:
    "1px solid #CBD5E1",

  borderRadius:
    "9px",

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

const saveButtonStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "7px",

  padding:
    "11px 17px",

  border:
    "none",

  borderRadius:
    "9px",

  background:
    "#0B5E3B",

  color:
    "#FFFFFF",

  fontSize:
    "12px",

  fontWeight:
    "800",

  boxShadow:
    "0 5px 14px rgba(11,94,59,0.18)",
};

const errorStyle = {
  marginBottom:
    "18px",

  padding:
    "13px 15px",

  background:
    "#FEF2F2",

  border:
    "1px solid #FECACA",

  borderRadius:
    "9px",

  color:
    "#B91C1C",

  fontSize:
    "12px",

  fontWeight:
    "600",
};

const messageStyle = {
  padding:
    "28px",

  textAlign:
    "center",

  color:
    "#64748B",

  fontSize:
    "13px",
};

export default RolePermissionsEditor;