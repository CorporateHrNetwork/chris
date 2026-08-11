import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  apiRequest,
} from "../../services/api";

function EmployeeProfile() {
  const { employeeNumber } = useParams();

  const navigate = useNavigate();

  const [profile, setProfile] =
    useState(null);

  const [formData, setFormData] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [editing, setEditing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");
  /*
  ============================================================
  EMPLOYMENT HISTORY STATE
  ============================================================
  */

  const [
    lifecycleHistory,
    setLifecycleHistory,
  ] = useState([]);

  const [
    lifecycleLoading,
    setLifecycleLoading,
  ] = useState(true);

  const [
    lifecycleError,
    setLifecycleError,
  ] = useState("");
  /*
  ============================================================
  EMPLOYEE TRANSFER STATE
  ============================================================
  */

  const [
    transferOpen,
    setTransferOpen,
  ] = useState(false);

  const [
    transferSaving,
    setTransferSaving,
  ] = useState(false);

  const [
    locations,
    setLocations,
  ] = useState([]);

  const [
    transferForm,
    setTransferForm,
  ] = useState({
    locationId: "",
    effectiveDate:
      new Date()
        .toISOString()
        .slice(0, 10),
    reason: "",
    notes: "",
  });


  /*
  ============================================================
  EMPLOYEE CAREER PROMOTION STATE
  ============================================================
  */

  const [
    promotionOpen,
    setPromotionOpen,
  ] = useState(false);

  const [
    promotionSaving,
    setPromotionSaving,
  ] = useState(false);

  const [
    promotionOptionsLoading,
    setPromotionOptionsLoading,
  ] = useState(false);

  const [
    promotionOptions,
    setPromotionOptions,
  ] = useState([]);

  const [
    promotionCareer,
    setPromotionCareer,
  ] = useState(null);

  const [
    promotionForm,
    setPromotionForm,
  ] = useState({
    designationId: "",

    effectiveDate:
      new Date()
        .toISOString()
        .slice(0, 10),

    reason: "",

    notes: "",
  });

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError("");

      const result =
        await apiRequest(
          `/api/employees/${encodeURIComponent(
            employeeNumber
          )}`
        );

      const employee =
        result.data;

      const normalizedProfile = {
        databaseId:
          employee.id,

        id:
          employee.employeeNumber,

        name: [
          employee.firstName,
          employee.middleName,
          employee.lastName,
        ]
          .filter(Boolean)
          .join(" "),

        department:
          employee.department
            ?.name || "",

        designation:
          employee.designation
            ?.name || "",

        email:
          employee.email || "",

        phone:
          employee.phone || "",

        status:
          formatStatus(
            employee.status
          ),

        hireDate:
          employee.hireDate,

        confirmationDate:
          employee.confirmationDate,

        exitDate:
          employee.exitDate,
        locationId:
          employee.locationId ||
          "",

        locationName:
          employee.location
            ?.name ||
          "Not Assigned",

        locationCode:
          employee.location
            ?.code ||
          "",
      };

      setProfile(
        normalizedProfile
      );

      setFormData({
        name:
          normalizedProfile.name,

        department:
          normalizedProfile.department,

        designation:
          normalizedProfile.designation,

        email:
          normalizedProfile.email,

        phone:
          normalizedProfile.phone,

        status:
          normalizedProfile.status,

        hireDate:
          toDateInput(
            normalizedProfile.hireDate
          ),

        confirmationDate:
          toDateInput(
            normalizedProfile.confirmationDate
          ),

        exitDate:
          toDateInput(
            normalizedProfile.exitDate
          ),
      });
    } catch (err) {
      console.error(
        "Employee profile error:",
        err
      );

      setError(
        err.message ||
          "CHRIS could not load the employee profile."
      );
    } finally {
      setLoading(false);
    }
  };
  /*
  ============================================================
  LOAD EMPLOYMENT HISTORY
  ============================================================
  */

  const loadLifecycleHistory =
    async () => {
      try {
        setLifecycleLoading(
          true
        );

        setLifecycleError("");

        const result =
          await apiRequest(
            `/api/employees/${encodeURIComponent(
              employeeNumber
            )}/lifecycle`
          );

        setLifecycleHistory(
          result.data || []
        );
      } catch (err) {
        console.error(
          "Employee lifecycle history error:",
          err
        );

        setLifecycleError(
          err.message ||
            "CHRIS could not load employment history."
        );
      } finally {
        setLifecycleLoading(
          false
        );
      }
    };

  useEffect(() => {
    loadProfile();
    loadLifecycleHistory();
  }, [employeeNumber]);
const handleChange = (
    event
  ) => {
    const {
      name,
      value,
    } = event.target;

    setFormData(
      (current) => ({
        ...current,
        [name]: value,
      })
    );
  };

  const handleSave = async (
    event
  ) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await apiRequest(
        `/api/employees/${encodeURIComponent(
          employeeNumber
        )}`,
        {
          method: "PUT",
          body: JSON.stringify(
            formData
          ),
        }
      );

      await loadProfile();

      setEditing(false);

      setSuccess(
        "Employee updated successfully."
      );

      setTimeout(() => {
        setSuccess("");
      }, 4000);
    } catch (err) {
      console.error(
        "Employee update error:",
        err
      );

      setError(
        err.message ||
          "CHRIS could not update this employee."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);

    setError("");
    setSuccess("");

    setFormData({
      name:
        profile.name,

      department:
        profile.department,

      designation:
        profile.designation,

      email:
        profile.email,

      phone:
        profile.phone,

      status:
        profile.status,

      hireDate:
        toDateInput(
          profile.hireDate
        ),

      confirmationDate:
        toDateInput(
          profile.confirmationDate
        ),

      exitDate:
        toDateInput(
          profile.exitDate
        ),
    });
  };
  /*
  ============================================================
  OPEN TRANSFER FORM
  ============================================================
  */

  const openTransferForm =
    async () => {
      try {
        setError("");
        setSuccess("");

        setEditing(false);

        const result =
          await apiRequest(
            "/api/location-catalog"
          );

        const activeLocations =
          (result.data || [])
            .filter(
              (location) =>
                location.isActive !==
                false
            );

        setLocations(
          activeLocations
        );

        setTransferForm({
          locationId: "",
          effectiveDate:
            new Date()
              .toISOString()
              .slice(0, 10),
          reason: "",
          notes: "",
        });

        setTransferOpen(
          true
        );
      } catch (err) {
        console.error(
          "Transfer location load error:",
          err
        );

        setError(
          err.message ||
            "CHRIS could not load organization locations."
        );
      }
    };


  /*
  ============================================================
  TRANSFER FORM CHANGE
  ============================================================
  */

  const handleTransferChange =
    (event) => {
      const {
        name,
        value,
      } = event.target;

      setTransferForm(
        (current) => ({
          ...current,
          [name]:
            value,
        })
      );
    };


  /*
  ============================================================
  CANCEL TRANSFER
  ============================================================
  */

  const cancelTransfer =
    () => {
      setTransferOpen(
        false
      );

      setTransferForm({
        locationId: "",
        effectiveDate:
          new Date()
            .toISOString()
            .slice(0, 10),
        reason: "",
        notes: "",
      });

      setError("");
    };


  /*
  ============================================================
  PROCESS EMPLOYEE TRANSFER
  ============================================================
  */

  const handleTransfer =
    async (event) => {
      event.preventDefault();

      if (
        !transferForm.locationId
      ) {
        setError(
          "Select a destination location."
        );

        return;
      }

      if (
        transferForm.locationId ===
        profile.locationId
      ) {
        setError(
          "The employee is already assigned to the selected location."
        );

        return;
      }

      if (
        !transferForm.effectiveDate
      ) {
        setError(
          "Transfer effective date is required."
        );

        return;
      }

      try {
        setTransferSaving(
          true
        );

        setError("");
        setSuccess("");

        const result =
          await apiRequest(
            `/api/employees/${encodeURIComponent(
              employeeNumber
            )}/transfer`,
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  locationId:
                    transferForm.locationId,

                  effectiveDate:
                    transferForm.effectiveDate,

                  reason:
                    transferForm.reason
                      .trim(),

                  notes:
                    transferForm.notes
                      .trim(),
                }),
            }
          );

        /*
        Refresh both current employee state and
        permanent Employment History.
        */

        await Promise.all([
          loadProfile(),
          loadLifecycleHistory(),
        ]);

        setTransferOpen(
          false
        );

        setTransferForm({
          locationId: "",
          effectiveDate:
            new Date()
              .toISOString()
              .slice(0, 10),
          reason: "",
          notes: "",
        });

        setSuccess(
          result.message ||
            "Employee transferred successfully."
        );

        setTimeout(() => {
          setSuccess("");
        }, 4000);
      } catch (err) {
        console.error(
          "Employee transfer error:",
          err
        );

        setError(
          err.message ||
            "CHRIS could not transfer this employee."
        );
      } finally {
        setTransferSaving(
          false
        );
      }
    };


  /*
  ============================================================
  OPEN CAREER PROMOTION FORM
  ============================================================

  Promotion options are calculated by the backend.

  The frontend does not determine career eligibility.
  ============================================================
  */

  const openPromotionForm =
    async () => {
      try {
        setError("");
        setSuccess("");

        /*
        Keep controlled HR transactions mutually exclusive.
        */

        setEditing(false);

        setTransferOpen(
          false
        );

        setPromotionOpen(
          true
        );

        setPromotionOptionsLoading(
          true
        );

        setPromotionOptions([]);

        setPromotionCareer(
          null
        );

        setPromotionForm({
          designationId: "",

          effectiveDate:
            new Date()
              .toISOString()
              .slice(0, 10),

          reason: "",

          notes: "",
        });


        /*
        Load backend-calculated upward career positions.
        */

        const result =
          await apiRequest(
            `/api/employees/${encodeURIComponent(
              employeeNumber
            )}/promotion-options`
          );


        setPromotionOptions(
          result.data || []
        );

        setPromotionCareer(
          result.employee ||
          null
        );
      } catch (err) {
        console.error(
          "Promotion options load error:",
          err
        );

        setPromotionOptions([]);

        setPromotionCareer(
          null
        );

        setError(
          err.message ||
            "CHRIS could not load valid promotion positions."
        );
      } finally {
        setPromotionOptionsLoading(
          false
        );
      }
    };


  /*
  ============================================================
  PROMOTION FORM CHANGE
  ============================================================
  */

  const handlePromotionChange =
    (event) => {
      const {
        name,
        value,
      } = event.target;

      setPromotionForm(
        (current) => ({
          ...current,

          [name]:
            value,
        })
      );
    };


  /*
  ============================================================
  CANCEL PROMOTION
  ============================================================
  */

  const cancelPromotion =
    () => {
      setPromotionOpen(
        false
      );

      setPromotionOptions([]);

      setPromotionCareer(
        null
      );

      setPromotionForm({
        designationId: "",

        effectiveDate:
          new Date()
            .toISOString()
            .slice(0, 10),

        reason: "",

        notes: "",
      });

      setError("");
    };


  /*
  ============================================================
  PROCESS CONTROLLED CAREER PROMOTION
  ============================================================
  */

  const handlePromotion =
    async (event) => {
      event.preventDefault();


      /*
      ----------------------------------------------------------
      DESIGNATION MUST COME FROM CHRIS PROMOTION OPTIONS
      ----------------------------------------------------------
      */

      if (
        !promotionForm.designationId
      ) {
        setError(
          "Select an eligible promotion designation."
        );

        return;
      }


      /*
      ----------------------------------------------------------
      CLIENT-SIDE VALIDATION

      Backend validates the selected position independently.
      ----------------------------------------------------------
      */

      const selectedDesignation =
        promotionOptions.find(
          (designation) =>
            designation.id ===
            promotionForm.designationId
        );

      if (!selectedDesignation) {
        setError(
          "The selected designation is not a valid promotion option."
        );

        return;
      }


      if (
        !promotionForm.effectiveDate
      ) {
        setError(
          "Promotion effective date is required."
        );

        return;
      }


      try {
        setPromotionSaving(
          true
        );

        setError("");
        setSuccess("");


        const result =
          await apiRequest(
            `/api/employees/${encodeURIComponent(
              employeeNumber
            )}/promote`,
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  designationId:
                    promotionForm.designationId,

                  effectiveDate:
                    promotionForm.effectiveDate,

                  reason:
                    promotionForm.reason
                      .trim(),

                  notes:
                    promotionForm.notes
                      .trim(),
                }),
            }
          );


        /*
        Refresh employee master record and Employment History.
        */

        await Promise.all([
          loadProfile(),
          loadLifecycleHistory(),
        ]);


        setPromotionOpen(
          false
        );

        setPromotionOptions([]);

        setPromotionCareer(
          null
        );

        setPromotionForm({
          designationId: "",

          effectiveDate:
            new Date()
              .toISOString()
              .slice(0, 10),

          reason: "",

          notes: "",
        });


        setSuccess(
          result.message ||
            "Employee promotion recorded successfully."
        );


        setTimeout(() => {
          setSuccess("");
        }, 4000);
      } catch (err) {
        console.error(
          "Employee career promotion error:",
          err
        );

        setError(
          err.message ||
            "CHRIS could not process this employee promotion."
        );
      } finally {
        setPromotionSaving(
          false
        );
      }
    };

  if (loading) {
    return (
      <div
        style={
          loadingStyle
        }
      >
        Loading employee profile...
      </div>
    );
  }

  if (
    error &&
    !profile
  ) {
    return (
      <div
        style={pageStyle}
      >
        <button
          type="button"
          onClick={() =>
            navigate(
              "/employees"
            )
          }
          style={
            backButtonStyle
          }
        >
          &lt; Back to Employees
        </button>

        <ErrorMessage
          message={
            error
          }
        />
      </div>
    );
  }

  const initials =
    profile.name
      .split(" ")
      .map((name) =>
        name.charAt(0)
      )
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div
      style={
        pageStyle
      }
    >
      <button
        type="button"
        onClick={() =>
          navigate(
            "/employees"
          )
        }
        style={
          backButtonStyle
        }
      >
        &lt; Back to Employees
      </button>

      {success && (
        <div
          style={
            successStyle
          }
        >
          {success}
        </div>
      )}

      {error && (
        <ErrorMessage
          message={
            error
          }
        />
      )}

      <div
        style={
          headerCardStyle
        }
      >
        <div
          style={
            profileIdentityStyle
          }
        >
          <div
            style={
              avatarStyle
            }
          >
            {initials}
          </div>

          <div>
            <p
              style={
                eyebrowStyle
              }
            >
              Employee Profile
            </p>

            <h1
              style={
                nameStyle
              }
            >
              {profile.name}
            </h1>

            <p
              style={
                subtitleStyle
              }
            >
              {profile.designation}
              {" - "}
              {profile.department}
            </p>

            <p
              style={
                employeeNumberStyle
              }
            >
              {profile.id}
            </p>
          </div>
        </div>

        <StatusBadge
          status={
            profile.status
          }
        />
      </div>

      {editing ? (
        <form
          onSubmit={
            handleSave
          }
          style={
            editCardStyle
          }
        >
          <div
            style={
              editHeaderStyle
            }
          >
            <div>
              <h2
                style={
                  editTitleStyle
                }
              >
                Edit Employee
              </h2>

              <p
                style={
                  editSubtitleStyle
                }
              >
                Update the employee record and save changes to CHRIS.
              </p>
            </div>

            <div
              style={
                buttonGroupStyle
              }
            >
              <button
                type="button"
                onClick={
                  handleCancel
                }
                disabled={
                  saving
                }
                style={
                  cancelButtonStyle
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  saving
                }
                style={{
                  ...saveButtonStyle,
                  opacity:
                    saving
                      ? 0.7
                      : 1,
                }}
              >
                {saving
                  ? "Saving..."
                  : "Save Changes"}
              </button>
            </div>
          </div>

          <div
            style={
              formGridStyle
            }
          >
            <FormField
              label="Full Name"
              name="name"
              value={
                formData.name
              }
              onChange={
                handleChange
              }
              required
              disabled={
                saving
              }
            />

            <FormField
              label="Email Address"
              name="email"
              type="email"
              value={
                formData.email
              }
              onChange={
                handleChange
              }
              required
              disabled={
                saving
              }
            />

            <FormField
              label="Phone Number"
              name="phone"
              value={
                formData.phone
              }
              onChange={
                handleChange
              }
              required
              disabled={
                saving
              }
            />

            <FormField
              label="Department"
              name="department"
              value={
                formData.department
              }
              onChange={
                handleChange
              }
              required
              disabled={
                saving
              }
            />

            <FormField
              label="Designation"
              name="designation"
              value={
                formData.designation
              }
              onChange={
                handleChange
              }
              required
              disabled={
                saving
              }
            />

            <div>
              <label
                style={
                  labelStyle
                }
              >
                Employment Status
              </label>

              <select
                name="status"
                value={
                  formData.status
                }
                onChange={
                  handleChange
                }
                style={
                  fieldStyle
                }
                disabled={
                  saving
                }
              >
                <option value="Active">
                  Active
                </option>

                <option value="Probation">
                  Probation
                </option>

                <option value="Leave">
                  Leave
                </option>

                <option value="Suspended">
                  Suspended
                </option>

                <option value="Resigned">
                  Resigned
                </option>

                <option value="Terminated">
                  Terminated
                </option>

                <option value="Retired">
                  Retired
                </option>

                <option value="Inactive">
                  Inactive
                </option>
              </select>
            </div>

            <FormField
              label="Hire Date"
              name="hireDate"
              type="date"
              value={
                formData.hireDate
              }
              onChange={
                handleChange
              }
              disabled={
                saving
              }
            />

            <FormField
              label="Confirmation Date"
              name="confirmationDate"
              type="date"
              value={
                formData.confirmationDate
              }
              onChange={
                handleChange
              }
              disabled={
                saving
              }
            />

            <FormField
              label="Exit Date"
              name="exitDate"
              type="date"
              value={
                formData.exitDate
              }
              onChange={
                handleChange
              }
              disabled={
                saving
              }
            />
          </div>
        </form>
      ) : (
        <div
          style={
            cardsGridStyle
          }
        >
          <InformationCard
            title="Employee Information"
          >
            <InfoRow
              label="Full Name"
              value={
                profile.name
              }
            />

            <InfoRow
              label="Employee ID"
              value={
                profile.id
              }
            />

            <InfoRow
              label="Department"
              value={
                profile.department
              }
            />

            <InfoRow
              label="Designation"
              value={
                profile.designation
              }
            />

            <InfoRow
              label="Employment Status"
              value={
                profile.status
              }
            />
          </InformationCard>

          <InformationCard
            title="Contact Information"
          >
            <InfoRow
              label="Email"
              value={
                profile.email
              }
            />

            <InfoRow
              label="Phone"
              value={
                profile.phone
              }
            />
          </InformationCard>

          <InformationCard
            title="Employment"
          >
            <InfoRow
              label="Hire Date"
              value={
                formatDate(
                  profile.hireDate
                )
              }
            />

            <InfoRow
              label="Confirmation Date"
              value={
                formatDate(
                  profile.confirmationDate
                )
              }
            />
            <InfoRow
              label="Current Location"
              value={
                profile.locationName
              }
            />
<InfoRow
              label="Exit Date"
              value={
                formatDate(
                  profile.exitDate
                )
              }
            />
          </InformationCard>

          <InformationCard
            title="Quick Actions"
          >
            <div
              style={
                actionsGridStyle
              }
            >
              <button
                type="button"
                onClick={() => {
                  setSuccess("");
                  setError("");
                  setTransferOpen(false);
                  setEditing(true);
                }}
                style={
                  actionButtonStyle
                }
              >
                Edit Employee
              </button>
              <button
                type="button"
                onClick={
                  openTransferForm
                }
                disabled={
                  [
                    "Resigned",
                    "Terminated",
                    "Retired",
                  ].includes(
                    profile.status
                  )
                }
                style={{
                  ...actionButtonStyle,
                  opacity:
                    [
                      "Resigned",
                      "Terminated",
                      "Retired",
                    ].includes(
                      profile.status
                    )
                      ? 0.5
                      : 1,
                  cursor:
                    [
                      "Resigned",
                      "Terminated",
                      "Retired",
                    ].includes(
                      profile.status
                    )
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                Transfer Employee
              </button>
              <button
                type="button"
                onClick={
                  openPromotionForm
                }
                disabled={
                  [
                    "Resigned",
                    "Terminated",
                    "Retired",
                    "Suspended",
                    "Inactive",
                  ].includes(
                    profile.status
                  )
                }
                style={{
                  ...actionButtonStyle,

                  opacity:
                    [
                      "Resigned",
                      "Terminated",
                      "Retired",
                      "Suspended",
                      "Inactive",
                    ].includes(
                      profile.status
                    )
                      ? 0.5
                      : 1,

                  cursor:
                    [
                      "Resigned",
                      "Terminated",
                      "Retired",
                      "Suspended",
                      "Inactive",
                    ].includes(
                      profile.status
                    )
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                Promote Employee
              </button>
<ActionButton
                text="Leave"
              />

              <ActionButton
                text="Payroll"
              />

              <ActionButton
                text="Documents"
              />
            </div>
          </InformationCard>
        </div>
      )}
      {transferOpen &&
        !editing && (
        <form
          onSubmit={
            handleTransfer
          }
          style={
            transferCardStyle
          }
        >
          <div
            style={
              transferHeaderStyle
            }
          >
            <div>
              <p
                style={
                  transferEyebrowStyle
                }
              >
                Employee Movement
              </p>

              <h2
                style={
                  transferTitleStyle
                }
              >
                Transfer Employee
              </h2>

              <p
                style={
                  transferSubtitleStyle
                }
              >
                Move this employee to another organization location
                while preserving the permanent employment history.
              </p>
            </div>

            <button
              type="button"
              onClick={
                cancelTransfer
              }
              disabled={
                transferSaving
              }
              style={
                cancelButtonStyle
              }
            >
              Cancel
            </button>
          </div>

          <div
            style={
              transferSummaryStyle
            }
          >
            <div>
              <span
                style={
                  transferSummaryLabelStyle
                }
              >
                Employee
              </span>

              <strong
                style={
                  transferSummaryValueStyle
                }
              >
                {profile.name}
              </strong>
            </div>

            <div>
              <span
                style={
                  transferSummaryLabelStyle
                }
              >
                Current Location
              </span>

              <strong
                style={
                  transferSummaryValueStyle
                }
              >
                {profile.locationName}
                {profile.locationCode
                  ? ` (${profile.locationCode})`
                  : ""}
              </strong>
            </div>
          </div>

          <div
            style={
              transferGridStyle
            }
          >
            <div>
              <label
                style={
                  labelStyle
                }
              >
                Transfer To *
              </label>

              <select
                name="locationId"
                value={
                  transferForm.locationId
                }
                onChange={
                  handleTransferChange
                }
                disabled={
                  transferSaving
                }
                required
                style={
                  fieldStyle
                }
              >
                <option value="">
                  Select destination
                </option>

                {locations
                  .filter(
                    (location) =>
                      location.id !==
                      profile.locationId
                  )
                  .map(
                    (location) => (
                      <option
                        key={
                          location.id
                        }
                        value={
                          location.id
                        }
                      >
                        {location.name}
                        {location.code
                          ? ` (${location.code})`
                          : ""}
                      </option>
                    )
                  )}
              </select>
            </div>

            <div>
              <label
                style={
                  labelStyle
                }
              >
                Effective Date *
              </label>

              <input
                type="date"
                name="effectiveDate"
                value={
                  transferForm.effectiveDate
                }
                onChange={
                  handleTransferChange
                }
                disabled={
                  transferSaving
                }
                required
                style={
                  fieldStyle
                }
              />
            </div>

            <div>
              <label
                style={
                  labelStyle
                }
              >
                Reason
              </label>

              <input
                type="text"
                name="reason"
                value={
                  transferForm.reason
                }
                onChange={
                  handleTransferChange
                }
                disabled={
                  transferSaving
                }
                placeholder="e.g. Operational deployment"
                style={
                  fieldStyle
                }
              />
            </div>
          </div>

          <div
            style={{
              marginTop:
                "18px",
            }}
          >
            <label
              style={
                labelStyle
              }
            >
              Notes
            </label>

            <textarea
              name="notes"
              value={
                transferForm.notes
              }
              onChange={
                handleTransferChange
              }
              disabled={
                transferSaving
              }
              placeholder="Optional HR notes concerning this transfer..."
              rows={4}
              style={
                transferTextareaStyle
              }
            />
          </div>

          <div
            style={
              transferFooterStyle
            }
          >
            <button
              type="button"
              onClick={
                cancelTransfer
              }
              disabled={
                transferSaving
              }
              style={
                cancelButtonStyle
              }
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                transferSaving
              }
              style={{
                ...transferConfirmButtonStyle,
                opacity:
                  transferSaving
                    ? 0.7
                    : 1,
              }}
            >
              {transferSaving
                ? "Transferring..."
                : "Confirm Transfer"}
            </button>
          </div>
        </form>
      )}
      {promotionOpen &&
        !editing && (
        <form
          onSubmit={
            handlePromotion
          }
          style={
            promotionCardStyle
          }
        >
          <div
            style={
              promotionHeaderStyle
            }
          >
            <div>
              <p
                style={
                  promotionEyebrowStyle
                }
              >
                Career Progression
              </p>

              <h2
                style={
                  promotionTitleStyle
                }
              >
                Promote Employee
              </h2>

              <p
                style={
                  promotionSubtitleStyle
                }
              >
                Record a validated upward career movement using
                the organization's configured designation hierarchy.
              </p>
            </div>

            <button
              type="button"
              onClick={
                cancelPromotion
              }
              disabled={
                promotionSaving
              }
              style={
                cancelButtonStyle
              }
            >
              Cancel
            </button>
          </div>


          <div
            style={
              promotionSummaryStyle
            }
          >
            <div>
              <span
                style={
                  promotionSummaryLabelStyle
                }
              >
                Employee
              </span>

              <strong
                style={
                  promotionSummaryValueStyle
                }
              >
                {profile.name}
              </strong>
            </div>


            <div>
              <span
                style={
                  promotionSummaryLabelStyle
                }
              >
                Department
              </span>

              <strong
                style={
                  promotionSummaryValueStyle
                }
              >
                {profile.department ||
                  "Not Assigned"}
              </strong>
            </div>


            <div>
              <span
                style={
                  promotionSummaryLabelStyle
                }
              >
                Current Designation
              </span>

              <strong
                style={
                  promotionSummaryValueStyle
                }
              >
                {promotionCareer
                  ?.currentDesignation
                  ?.name ||
                  profile.designation ||
                  "Not Assigned"}
              </strong>
            </div>


            <div>
              <span
                style={
                  promotionSummaryLabelStyle
                }
              >
                Career Track
              </span>

              <strong
                style={
                  promotionSummaryValueStyle
                }
              >
                {promotionCareer
                  ?.currentDesignation
                  ?.careerTrack ||
                  "Not Configured"}
              </strong>
            </div>


            <div>
              <span
                style={
                  promotionSummaryLabelStyle
                }
              >
                Current Level
              </span>

              <strong
                style={
                  promotionSummaryValueStyle
                }
              >
                {promotionCareer
                  ?.currentDesignation
                  ?.careerLevel != null
                    ? `Level ${promotionCareer.currentDesignation.careerLevel}`
                    : "Not Configured"}
              </strong>
            </div>
          </div>


          {promotionOptionsLoading ? (
            <div
              style={
                promotionOptionsMessageStyle
              }
            >
              Loading eligible promotion positions...
            </div>
          ) : promotionOptions.length ===
            0 ? (
            <div
              style={
                promotionNoOptionsStyle
              }
            >
              No higher career position is currently configured
              for this employee's career track.
            </div>
          ) : (
            <>
              <div
                style={
                  promotionGridStyle
                }
              >
                <div>
                  <label
                    style={
                      labelStyle
                    }
                  >
                    New Designation *
                  </label>

                  <select
                    name="designationId"
                    value={
                      promotionForm.designationId
                    }
                    onChange={
                      handlePromotionChange
                    }
                    disabled={
                      promotionSaving
                    }
                    required
                    style={
                      fieldStyle
                    }
                  >
                    <option value="">
                      Select eligible position
                    </option>

                    {promotionOptions.map(
                      (designation) => (
                        <option
                          key={
                            designation.id
                          }
                          value={
                            designation.id
                          }
                        >
                          {designation.name}
                          {" - "}
                          Level {designation.careerLevel}
                        </option>
                      )
                    )}
                  </select>

                  <p
                    style={
                      promotionFieldHintStyle
                    }
                  >
                    Only active positions above the employee's
                    current level within the same career track
                    are available.
                  </p>
                </div>


                <div>
                  <label
                    style={
                      labelStyle
                    }
                  >
                    Effective Date *
                  </label>

                  <input
                    type="date"
                    name="effectiveDate"
                    value={
                      promotionForm.effectiveDate
                    }
                    onChange={
                      handlePromotionChange
                    }
                    disabled={
                      promotionSaving
                    }
                    required
                    style={
                      fieldStyle
                    }
                  />
                </div>


                <div>
                  <label
                    style={
                      labelStyle
                    }
                  >
                    Reason
                  </label>

                  <input
                    type="text"
                    name="reason"
                    value={
                      promotionForm.reason
                    }
                    onChange={
                      handlePromotionChange
                    }
                    disabled={
                      promotionSaving
                    }
                    placeholder="e.g. Performance-based promotion"
                    style={
                      fieldStyle
                    }
                  />
                </div>
              </div>


              <div
                style={{
                  marginTop:
                    "18px",
                }}
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  Notes
                </label>

                <textarea
                  name="notes"
                  value={
                    promotionForm.notes
                  }
                  onChange={
                    handlePromotionChange
                  }
                  disabled={
                    promotionSaving
                  }
                  placeholder="Optional HR notes concerning this career promotion..."
                  rows={4}
                  style={
                    promotionTextareaStyle
                  }
                />
              </div>


              <div
                style={
                  promotionFooterStyle
                }
              >
                <button
                  type="button"
                  onClick={
                    cancelPromotion
                  }
                  disabled={
                    promotionSaving
                  }
                  style={
                    cancelButtonStyle
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    promotionSaving ||
                    !promotionForm.designationId
                  }
                  style={{
                    ...promotionConfirmButtonStyle,

                    opacity:
                      promotionSaving ||
                      !promotionForm.designationId
                        ? 0.6
                        : 1,

                    cursor:
                      promotionSaving ||
                      !promotionForm.designationId
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {promotionSaving
                    ? "Recording Promotion..."
                    : "Confirm Promotion"}
                </button>
              </div>
            </>
          )}
        </form>
      )}
      {!editing && (
        <section
          style={
            historySectionStyle
          }
        >
          <div
            style={
              historyHeaderStyle
            }
          >
            <div>
              <p
                style={
                  historyEyebrowStyle
                }
              >
                Employee Lifecycle
              </p>

              <h2
                style={
                  historyTitleStyle
                }
              >
                Employment History
              </h2>

              <p
                style={
                  historySubtitleStyle
                }
              >
                Permanent record of employment lifecycle events,
                status changes and location movements.
              </p>
            </div>

            <div
              style={
                historyCountStyle
              }
            >
              {lifecycleHistory.length} event
              {lifecycleHistory.length === 1
                ? ""
                : "s"}
            </div>
          </div>

          {lifecycleLoading ? (
            <div
              style={
                historyEmptyStyle
              }
            >
              Loading employment history...
            </div>
          ) : lifecycleError ? (
            <div
              style={
                historyErrorStyle
              }
            >
              {lifecycleError}
            </div>
          ) : lifecycleHistory.length === 0 ? (
            <div
              style={
                historyEmptyStyle
              }
            >
              No lifecycle events have been recorded for this employee yet.
            </div>
          ) : (
            <div
              style={
                timelineStyle
              }
            >
              {lifecycleHistory.map(
                (
                  event,
                  index
                ) => (
                  <LifecycleEvent
                    key={
                      event.id
                    }
                    event={
                      event
                    }
                    isLast={
                      index ===
                      lifecycleHistory.length - 1
                    }
                  />
                )
              )}
            </div>
          )}
        </section>
      )}
</div>
  );
}

function LifecycleEvent({
  event,
  isLast,
}) {
  const performedByName =
    [
      event.performedBy?.firstName,
      event.performedBy?.lastName,
    ]
      .filter(Boolean)
      .join(" ");

  const fromLocation =
    event.fromLocation?.name ||
    "Not Assigned";

  const toLocation =
    event.toLocation?.name ||
    "Not Assigned";

  return (
    <div
      style={{
        position:
          "relative",
        display:
          "grid",
        gridTemplateColumns:
          "34px 1fr",
        gap:
          "15px",
      }}
    >
      <div
        style={{
          position:
            "relative",
          display:
            "flex",
          justifyContent:
            "center",
        }}
      >
        <div
          style={
            timelineDotStyle
          }
        />

        {!isLast && (
          <div
            style={
              timelineLineStyle
            }
          />
        )}
      </div>

      <div
        style={{
          paddingBottom:
            isLast
              ? 0
              : "24px",
        }}
      >
        <div
          style={
            lifecycleCardStyle
          }
        >
          <div
            style={
              lifecycleTopRowStyle
            }
          >
            <div>
              <div
                style={
                  lifecycleEventTitleStyle
                }
              >
                {formatLifecycleEvent(
                  event.eventType
                )}
              </div>

              <div
                style={
                  lifecycleDateStyle
                }
              >
                {formatLongDate(
                  event.effectiveDate
                )}
              </div>
            </div>

            <span
              style={
                lifecycleEventBadgeStyle
              }
            >
              {event.eventType}
            </span>
          </div>

          {(event.previousStatus ||
            event.newStatus) && (
            <HistoryDetail
              label="Status"
              value={`${formatStatus(
                event.previousStatus
              )} \u2192 ${formatStatus(
                event.newStatus
              )}`}
            />
          )}

          {(event.fromLocation ||
            event.toLocation) &&
            event.fromLocation?.id !==
              event.toLocation?.id && (
              <HistoryDetail
                label="Location"
                value={`${fromLocation} → ${toLocation}`}
              />
            )}

          {event.previousDepartment ||
          event.newDepartment ? (
            <HistoryDetail
              label="Department"
              value={`${event.previousDepartment?.name ||
                "Not Assigned"} \u2192 ${event.newDepartment?.name ||
                "Not Assigned"}`}
            />
          ) : null}

          {event.previousDesignation ||
          event.newDesignation ? (
            <HistoryDetail
              label="Designation"
              value={`${event.previousDesignation?.name ||
                "Not Assigned"} \u2192 ${event.newDesignation?.name ||
                "Not Assigned"}`}
            />
          ) : null}
          {event.reason && (
            <HistoryDetail
              label="Reason"
              value={
                event.reason
              }
            />
          )}

          {event.notes && (
            <HistoryDetail
              label="Notes"
              value={
                event.notes
              }
            />
          )}

          <HistoryDetail
            label="Performed By"
            value={
              performedByName ||
              event.performedBy?.email ||
              "System"
            }
          />
        </div>
      </div>
    </div>
  );
}

function HistoryDetail({
  label,
  value,
}) {
  return (
    <div
      style={
        historyDetailStyle
      }
    >
      <span
        style={
          historyDetailLabelStyle
        }
      >
        {label}
      </span>

      <span
        style={
          historyDetailValueStyle
        }
      >
        {value || "-"}
      </span>
    </div>
  );
}

function formatLifecycleEvent(
  eventType
) {
  const labels = {
    JOINED:
      "Joined Organization",
    CONFIRMED:
      "Employment Confirmed",
    TRANSFERRED:
      "Employee Transferred",
    PROMOTED:
      "Employee Promoted",
    SUSPENDED:
      "Employee Suspended",
    REACTIVATED:
      "Employee Reactivated",
    DEACTIVATED:
      "Employee Deactivated",
    EXITED:
      "Employee Exited",
    REINSTATED:
      "Employee Reinstated",
    REHIRED:
      "Employee Rehired",
  };

  return (
    labels[eventType] ||
    eventType
  );
}

function formatLongDate(
  value
) {
  if (!value) {
    return "-";
  }

  return new Date(
    value
  ).toLocaleDateString(
    "en-NG",
    {
      day:
        "2-digit",
      month:
        "short",
      year:
        "numeric",
    }
  );
}
function FormField({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
  disabled = false,
}) {
  return (
    <div>
      <label
        style={
          labelStyle
        }
      >
        {label}
        {required
          ? " *"
          : ""}
      </label>

      <input
        name={name}
        type={type}
        value={
          value || ""
        }
        onChange={
          onChange
        }
        required={
          required
        }
        disabled={
          disabled
        }
        style={
          fieldStyle
        }
      />
    </div>
  );
}

function ErrorMessage({
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

function formatStatus(
  status
) {
  const labels = {
    ACTIVE: "Active",
    PROBATION: "Probation",
    LEAVE: "Leave",
    SUSPENDED: "Suspended",
    TERMINATED:
      "Terminated",
    RESIGNED: "Resigned",
    RETIRED: "Retired",
    INACTIVE: "Inactive",
  };

  if (!status) {
    return "-";
  }

  return (
    labels[status] ||
    status
  );
}

function formatDate(
  value
) {
  if (!value) {
    return "-";
  }

  return new Date(
    value
  ).toLocaleDateString();
}

function toDateInput(
  value
) {
  if (!value) {
    return "";
  }

  return new Date(
    value
  )
    .toISOString()
    .slice(0, 10);
}

function StatusBadge({
  status,
}) {
  let background =
    "#F1F5F9";

  let color =
    "#475569";

  if (
    status === "Active"
  ) {
    background =
      "#E8F8F0";

    color =
      "#087443";
  }

  if (
    status === "Leave"
  ) {
    background =
      "#FFF4E5";

    color =
      "#B45309";
  }

  if (
    status === "Probation"
  ) {
    background =
      "#F0E9FF";

    color =
      "#6D28D9";
  }

  if (
    status === "Suspended"
  ) {
    background =
      "#FEF2F2";

    color =
      "#B91C1C";
  }

  return (
    <div
      style={{
        display:
          "inline-flex",
        alignItems:
          "center",
        padding:
          "8px 14px",
        borderRadius:
          "999px",
        background,
        color,
        fontSize:
          "13px",
        fontWeight:
          "700",
      }}
    >
      {status}
    </div>
  );
}

function InformationCard({
  title,
  children,
}) {
  return (
    <div
      style={
        informationCardStyle
      }
    >
      <h2
        style={
          informationTitleStyle
        }
      >
        {title}
      </h2>

      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
}) {
  return (
    <div
      style={
        infoRowStyle
      }
    >
      <span
        style={
          infoLabelStyle
        }
      >
        {label}
      </span>

      <span
        style={
          infoValueStyle
        }
      >
        {value || "-"}
      </span>
    </div>
  );
}

function ActionButton({
  text,
}) {
  return (
    <button
      type="button"
      style={
        actionButtonStyle
      }
    >
      {text}
    </button>
  );
}

const pageStyle = {
  width: "100%",
  maxWidth: "1200px",
  margin: "0 auto",
};

const loadingStyle = {
  padding: "40px",
  textAlign: "center",
  color: "#64748B",
  fontSize: "14px",
};

const backButtonStyle = {
  border: "none",
  background:
    "transparent",
  color: "#0B5E3B",
  fontSize: "14px",
  fontWeight: "700",
  cursor: "pointer",
  padding: 0,
  marginBottom: "22px",
};

const headerCardStyle = {
  background: "#FFFFFF",
  border:
    "1px solid #E5E7EB",
  borderRadius: "18px",
  padding: "26px",
  marginBottom: "22px",
  boxShadow:
    "0 6px 24px rgba(15, 23, 42, 0.05)",
  display: "flex",
  alignItems: "center",
  justifyContent:
    "space-between",
  gap: "20px",
  flexWrap: "wrap",
};

const profileIdentityStyle = {
  display: "flex",
  alignItems: "center",
  gap: "18px",
};

const avatarStyle = {
  width: "72px",
  height: "72px",
  borderRadius: "50%",
  background: "#E8F5EF",
  color: "#0B5E3B",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "24px",
  fontWeight: "800",
  flexShrink: 0,
};

const eyebrowStyle = {
  margin: "0 0 5px",
  color: "#64748B",
  fontSize: "13px",
  fontWeight: "600",
};

const nameStyle = {
  margin: 0,
  color: "#0F172A",
  fontSize: "28px",
  fontWeight: "800",
};

const subtitleStyle = {
  margin: "6px 0 0",
  color: "#64748B",
  fontSize: "14px",
};

const employeeNumberStyle = {
  margin: "5px 0 0",
  color: "#0B5E3B",
  fontSize: "13px",
  fontWeight: "700",
};

const cardsGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "22px",
};

const informationCardStyle = {
  background: "#FFFFFF",
  border:
    "1px solid #E5E7EB",
  borderRadius: "18px",
  padding: "24px",
  boxShadow:
    "0 6px 24px rgba(15, 23, 42, 0.05)",
};

const informationTitleStyle = {
  margin: "0 0 18px",
  color: "#0B5E3B",
  fontSize: "18px",
  fontWeight: "800",
};

const infoRowStyle = {
  display: "flex",
  justifyContent:
    "space-between",
  alignItems:
    "flex-start",
  gap: "20px",
  padding: "13px 0",
  borderBottom:
    "1px solid #EEF2F1",
};

const infoLabelStyle = {
  color: "#64748B",
  fontSize: "13px",
};

const infoValueStyle = {
  color: "#0F172A",
  fontSize: "14px",
  fontWeight: "700",
  textAlign: "right",
};

const actionsGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(2, 1fr)",
  gap: "12px",
};

const actionButtonStyle = {
  border:
    "1px solid #D1E5DB",
  background: "#F8FCFA",
  color: "#0B5E3B",
  borderRadius: "10px",
  padding: "12px",
  fontSize: "13px",
  fontWeight: "700",
  cursor: "pointer",
};

const editCardStyle = {
  background: "#FFFFFF",
  border:
    "1px solid #E5E7EB",
  borderRadius: "18px",
  padding: "26px",
  boxShadow:
    "0 6px 24px rgba(15, 23, 42, 0.05)",
};

const editHeaderStyle = {
  display: "flex",
  justifyContent:
    "space-between",
  alignItems:
    "flex-start",
  gap: "20px",
  flexWrap: "wrap",
  marginBottom: "25px",
};

const editTitleStyle = {
  margin: 0,
  color: "#0B5E3B",
  fontSize: "21px",
  fontWeight: "800",
};

const editSubtitleStyle = {
  margin: "6px 0 0",
  color: "#64748B",
  fontSize: "13px",
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "20px",
};

const labelStyle = {
  display: "block",
  marginBottom: "7px",
  color: "#334155",
  fontSize: "13px",
  fontWeight: "700",
};

const fieldStyle = {
  width: "100%",
  boxSizing:
    "border-box",
  padding: "12px 13px",
  borderRadius: "10px",
  border:
    "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: "14px",
  outline: "none",
};

const buttonGroupStyle = {
  display: "flex",
  gap: "10px",
};

const saveButtonStyle = {
  border: "none",
  background: "#0B5E3B",
  color: "#FFFFFF",
  borderRadius: "9px",
  padding: "11px 18px",
  fontSize: "13px",
  fontWeight: "700",
  cursor: "pointer",
};

const cancelButtonStyle = {
  border:
    "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#475569",
  borderRadius: "9px",
  padding: "11px 18px",
  fontSize: "13px",
  fontWeight: "700",
  cursor: "pointer",
};

const successStyle = {
  padding: "14px 16px",
  marginBottom: "18px",
  background: "#ECFDF5",
  border:
    "1px solid #A7F3D0",
  color: "#047857",
  borderRadius: "10px",
  fontSize: "14px",
  fontWeight: "700",
};

const errorStyle = {
  padding: "14px 16px",
  marginBottom: "18px",
  background: "#FEF2F2",
  border:
    "1px solid #FECACA",
  color: "#B91C1C",
  borderRadius: "10px",
  fontSize: "14px",
  fontWeight: "700",
};

const transferCardStyle = {
  marginTop:
    "22px",
  padding:
    "26px",
  background:
    "#FFFFFF",
  border:
    "1px solid #D1E5DB",
  borderRadius:
    "18px",
  boxShadow:
    "0 6px 24px rgba(15, 23, 42, 0.05)",
};

const transferHeaderStyle = {
  display:
    "flex",
  justifyContent:
    "space-between",
  alignItems:
    "flex-start",
  gap:
    "20px",
  flexWrap:
    "wrap",
  marginBottom:
    "22px",
};

const transferEyebrowStyle = {
  margin:
    "0 0 4px",
  color:
    "#64748B",
  fontSize:
    "11px",
  fontWeight:
    "800",
  textTransform:
    "uppercase",
  letterSpacing:
    "0.06em",
};

const transferTitleStyle = {
  margin:
    0,
  color:
    "#0B5E3B",
  fontSize:
    "21px",
  fontWeight:
    "800",
};

const transferSubtitleStyle = {
  margin:
    "6px 0 0",
  color:
    "#64748B",
  fontSize:
    "13px",
  lineHeight:
    "1.6",
};

const transferSummaryStyle = {
  display:
    "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(240px, 1fr))",
  gap:
    "14px",
  padding:
    "16px",
  marginBottom:
    "20px",
  background:
    "#F8FCFA",
  border:
    "1px solid #DDECE4",
  borderRadius:
    "12px",
};

const transferSummaryLabelStyle = {
  display:
    "block",
  marginBottom:
    "5px",
  color:
    "#64748B",
  fontSize:
    "11px",
  fontWeight:
    "700",
  textTransform:
    "uppercase",
};

const transferSummaryValueStyle = {
  color:
    "#0F172A",
  fontSize:
    "14px",
};

const transferGridStyle = {
  display:
    "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(240px, 1fr))",
  gap:
    "18px",
};

const transferTextareaStyle = {
  width:
    "100%",
  boxSizing:
    "border-box",
  padding:
    "12px 13px",
  borderRadius:
    "10px",
  border:
    "1px solid #CBD5E1",
  background:
    "#FFFFFF",
  color:
    "#0F172A",
  fontSize:
    "14px",
  fontFamily:
    "inherit",
  resize:
    "vertical",
  outline:
    "none",
};

const transferFooterStyle = {
  display:
    "flex",
  justifyContent:
    "flex-end",
  gap:
    "10px",
  marginTop:
    "22px",
};

const transferConfirmButtonStyle = {
  border:
    "none",
  background:
    "#0B5E3B",
  color:
    "#FFFFFF",
  borderRadius:
    "9px",
  padding:
    "11px 18px",
  fontSize:
    "13px",
  fontWeight:
    "700",
  cursor:
    "pointer",
};
const promotionCardStyle = {
  marginTop:
    "22px",

  padding:
    "26px",

  background:
    "#FFFFFF",

  border:
    "1px solid #D1E5DB",

  borderRadius:
    "18px",

  boxShadow:
    "0 6px 24px rgba(15, 23, 42, 0.05)",
};

const promotionHeaderStyle = {
  display:
    "flex",

  justifyContent:
    "space-between",

  alignItems:
    "flex-start",

  gap:
    "20px",

  flexWrap:
    "wrap",

  marginBottom:
    "22px",
};

const promotionEyebrowStyle = {
  margin:
    "0 0 4px",

  color:
    "#64748B",

  fontSize:
    "11px",

  fontWeight:
    "800",

  textTransform:
    "uppercase",

  letterSpacing:
    "0.06em",
};

const promotionTitleStyle = {
  margin:
    0,

  color:
    "#0B5E3B",

  fontSize:
    "21px",

  fontWeight:
    "800",
};

const promotionSubtitleStyle = {
  margin:
    "6px 0 0",

  color:
    "#64748B",

  fontSize:
    "13px",

  lineHeight:
    "1.6",
};

const promotionSummaryStyle = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",

  gap:
    "14px",

  padding:
    "16px",

  marginBottom:
    "20px",

  background:
    "#F8FCFA",

  border:
    "1px solid #DDECE4",

  borderRadius:
    "12px",
};

const promotionSummaryLabelStyle = {
  display:
    "block",

  marginBottom:
    "5px",

  color:
    "#64748B",

  fontSize:
    "11px",

  fontWeight:
    "700",

  textTransform:
    "uppercase",
};

const promotionSummaryValueStyle = {
  color:
    "#0F172A",

  fontSize:
    "14px",
};

const promotionGridStyle = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(240px, 1fr))",

  gap:
    "18px",
};

const promotionFieldHintStyle = {
  margin:
    "6px 0 0",

  color:
    "#64748B",

  fontSize:
    "11px",

  lineHeight:
    "1.5",
};

const promotionOptionsMessageStyle = {
  padding:
    "18px",

  marginBottom:
    "18px",

  borderRadius:
    "12px",

  background:
    "#F8FAFC",

  border:
    "1px solid #CBD5E1",

  color:
    "#475569",

  fontSize:
    "13px",

  fontWeight:
    "700",

  textAlign:
    "center",
};

const promotionNoOptionsStyle = {
  padding:
    "18px",

  marginBottom:
    "18px",

  borderRadius:
    "12px",

  background:
    "#FFFBEB",

  border:
    "1px solid #FDE68A",

  color:
    "#92400E",

  fontSize:
    "13px",

  fontWeight:
    "700",

  lineHeight:
    "1.6",
};
const promotionTextareaStyle = {
  width:
    "100%",

  boxSizing:
    "border-box",

  padding:
    "12px 13px",

  borderRadius:
    "10px",

  border:
    "1px solid #CBD5E1",

  background:
    "#FFFFFF",

  color:
    "#0F172A",

  fontSize:
    "14px",

  fontFamily:
    "inherit",

  resize:
    "vertical",

  outline:
    "none",
};

const promotionFooterStyle = {
  display:
    "flex",

  justifyContent:
    "flex-end",

  gap:
    "10px",

  marginTop:
    "22px",
};

const promotionConfirmButtonStyle = {
  border:
    "none",

  background:
    "#0B5E3B",

  color:
    "#FFFFFF",

  borderRadius:
    "9px",

  padding:
    "11px 18px",

  fontSize:
    "13px",

  fontWeight:
    "700",

  cursor:
    "pointer",
};
const historySectionStyle = {
  marginTop: "22px",
  padding: "26px",
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: "18px",
  boxShadow:
    "0 6px 24px rgba(15, 23, 42, 0.05)",
};

const historyHeaderStyle = {
  display: "flex",
  justifyContent:
    "space-between",
  alignItems:
    "flex-start",
  gap: "20px",
  flexWrap: "wrap",
  marginBottom: "26px",
};

const historyEyebrowStyle = {
  margin: "0 0 4px",
  color: "#64748B",
  fontSize: "11px",
  fontWeight: "800",
  textTransform:
    "uppercase",
  letterSpacing:
    "0.06em",
};

const historyTitleStyle = {
  margin: 0,
  color: "#0B5E3B",
  fontSize: "21px",
  fontWeight: "800",
};

const historySubtitleStyle = {
  margin: "6px 0 0",
  color: "#64748B",
  fontSize: "13px",
  lineHeight: "1.6",
};

const historyCountStyle = {
  padding: "7px 11px",
  borderRadius: "999px",
  background: "#F0FDF4",
  border:
    "1px solid #BBF7D0",
  color: "#047857",
  fontSize: "12px",
  fontWeight: "800",
};

const timelineStyle = {
  display: "flex",
  flexDirection: "column",
};

const timelineDotStyle = {
  width: "12px",
  height: "12px",
  marginTop: "8px",
  borderRadius: "50%",
  background: "#0B5E3B",
  border:
    "3px solid #D1FAE5",
  boxSizing: "content-box",
  zIndex: 2,
};

const timelineLineStyle = {
  position: "absolute",
  top: "25px",
  bottom: "-8px",
  width: "2px",
  background: "#D1E5DB",
};

const lifecycleCardStyle = {
  padding: "17px",
  background: "#F8FCFA",
  border:
    "1px solid #DDECE4",
  borderRadius: "13px",
};

const lifecycleTopRowStyle = {
  display: "flex",
  justifyContent:
    "space-between",
  alignItems:
    "flex-start",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "12px",
};

const lifecycleEventTitleStyle = {
  color: "#0F172A",
  fontSize: "15px",
  fontWeight: "800",
};

const lifecycleDateStyle = {
  marginTop: "3px",
  color: "#64748B",
  fontSize: "12px",
};

const lifecycleEventBadgeStyle = {
  padding: "5px 8px",
  borderRadius: "999px",
  background: "#E8F5EF",
  color: "#0B5E3B",
  fontSize: "9px",
  fontWeight: "900",
  letterSpacing:
    "0.04em",
};

const historyDetailStyle = {
  display: "grid",
  gridTemplateColumns:
    "130px 1fr",
  gap: "12px",
  padding: "8px 0",
  borderTop:
    "1px solid #E8EFEB",
};

const historyDetailLabelStyle = {
  color: "#64748B",
  fontSize: "12px",
  fontWeight: "700",
};

const historyDetailValueStyle = {
  color: "#334155",
  fontSize: "12px",
  fontWeight: "700",
};

const historyEmptyStyle = {
  padding: "28px",
  textAlign: "center",
  background: "#F8FAFC",
  border:
    "1px dashed #CBD5E1",
  borderRadius: "12px",
  color: "#64748B",
  fontSize: "13px",
};

const historyErrorStyle = {
  padding: "14px 16px",
  background: "#FEF2F2",
  border:
    "1px solid #FECACA",
  borderRadius: "10px",
  color: "#B91C1C",
  fontSize: "13px",
  fontWeight: "700",
};
export default EmployeeProfile;




