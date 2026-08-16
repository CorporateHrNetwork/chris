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
  EMPLOYMENT CONFIRMATION STATE
  ============================================================
  */

  const [
    confirmationOpen,
    setConfirmationOpen,
  ] = useState(false);

  const [
    confirmationSaving,
    setConfirmationSaving,
  ] = useState(false);

  const [
    confirmationForm,
    setConfirmationForm,
  ] = useState({
    effectiveDate:
      new Date()
        .toISOString()
        .slice(0, 10),

    reason:
      "Employment confirmed",

    notes: "",
  });
  /*
  ============================================================
  EMPLOYEE SUSPENSION STATE
  ============================================================
  */

  const [
    suspensionOpen,
    setSuspensionOpen,
  ] = useState(false);

  const [
    suspensionSaving,
    setSuspensionSaving,
  ] = useState(false);

  const [
    suspensionForm,
    setSuspensionForm,
  ] = useState({
    effectiveDate:
      new Date()
        .toISOString()
        .slice(0, 10),

    suspensionEndDate: "",

    reason: "",

    notes: "",
  });
  /*
  ============================================================
  EMPLOYEE REACTIVATION STATE
  ============================================================
  */

  const [
    reactivationOpen,
    setReactivationOpen,
  ] = useState(false);

  const [
    reactivationSaving,
    setReactivationSaving,
  ] = useState(false);

  const [
    reactivationForm,
    setReactivationForm,
  ] = useState({
    effectiveDate:
      new Date()
        .toISOString()
        .slice(0, 10),

    reason: "",

    notes: "",
  });

  /*
  ============================================================
  EMPLOYEE DEACTIVATION STATE
  ============================================================
  */

  const [
    deactivationOpen,
    setDeactivationOpen,
  ] = useState(false);

  const [
    deactivationSaving,
    setDeactivationSaving,
  ] = useState(false);

  const [
    deactivationForm,
    setDeactivationForm,
  ] = useState({
    effectiveDate:
      new Date()
        .toISOString()
        .slice(0, 10),

    reason: "",

    notes: "",
  });

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
  EMPLOYMENT EPISODES STATE
  ============================================================
  */

  const [
    employmentEpisodes,
    setEmploymentEpisodes,
  ] = useState([]);

  const [
    episodesLoading,
    setEpisodesLoading,
  ] = useState(true);

  const [
    episodesError,
    setEpisodesError,
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

  /*
  ============================================================
  EMPLOYEE JOB CHANGE / REASSIGNMENT STATE
  ============================================================

  Job Change is separate from:
  - Promotion
  - Location Transfer
  - Employee master-data editing

  It supports:
  - lateral movement
  - department reassignment
  - role reclassification
  - designation correction
  - organizational restructuring
  ============================================================
  */

  const [
    jobChangeOpen,
    setJobChangeOpen,
  ] = useState(false);

  const [
    jobChangeSaving,
    setJobChangeSaving,
  ] = useState(false);

  const [
    jobChangeCatalogLoading,
    setJobChangeCatalogLoading,
  ] = useState(false);

  const [
    jobChangeCatalog,
    setJobChangeCatalog,
  ] = useState([]);

  const [
    jobChangeForm,
    setJobChangeForm,
  ] = useState({
    departmentId: "",
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

        suspensionEndDate:
          employee.suspensionEndDate,

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

        locationId:
          normalizedProfile.locationId,

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

    /*
  ============================================================
  LOAD EMPLOYMENT EPISODES
  ============================================================
  */

  const loadEmploymentEpisodes =
    async () => {
      try {
        setEpisodesLoading(
          true
        );

        setEpisodesError("");

        const result =
          await apiRequest(
            `/api/employees/${encodeURIComponent(
              employeeNumber
            )}/employment-episodes`
          );

        setEmploymentEpisodes(
          result.data || []
        );
      } catch (err) {
        console.error(
          "Employee employment episodes error:",
          err
        );

        setEpisodesError(
          err.message ||
            "CHRIS could not load employment episodes."
        );
      } finally {
        setEpisodesLoading(
          false
        );
      }
    };

useEffect(() => {
    loadProfile();
    loadLifecycleHistory();
    loadEmploymentEpisodes();
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

    if (
      !profile.locationId &&
      !formData.locationId
    ) {
      setError(
        "Select the employee's initial work location before saving."
      );

      return;
    }

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

      locationId:
        profile.locationId || "",

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
  OPEN EMPLOYEE MASTER-DATA EDIT FORM
  ============================================================

  Location rule:
  - if the employee has no current location, HR may make the
    initial/corrective location assignment from the active
    organization location catalogue;
  - if a location is already assigned, Edit Employee cannot
    change it. A genuine movement must use Transfer Employee.
  ============================================================
  */

  const openEditForm =
    async () => {
      try {
        setSuccess("");
        setError("");

        setTransferOpen(false);
        setPromotionOpen(false);
        setJobChangeOpen(false);
        setConfirmationOpen(false);
        setSuspensionOpen(false);
        setReactivationOpen(false);
        setDeactivationOpen(false);

        setFormData(
          (current) => ({
            ...current,
            locationId:
              profile.locationId ||
              "",
          })
        );

        if (
          !profile.locationId
        ) {
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
        }

        setEditing(true);
      } catch (err) {
        console.error(
          "Edit employee location catalogue load error:",
          err
        );

        setError(
          err.message ||
            "CHRIS could not load active work locations."
        );
      }
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

        setConfirmationOpen(
          false
        );

        setSuspensionOpen(
          false
        );

        setReactivationOpen(
          false
        );

        setDeactivationOpen(
          false
        );

        setJobChangeOpen(
          false
        );

        setPromotionOpen(
          false
        );

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
  OPEN EMPLOYEE JOB CHANGE FORM
  ============================================================
  */

  const openJobChangeForm =
    async () => {
      try {
        setError("");
        setSuccess("");

        /*
        Only one controlled HR transaction should be
        open at a time.
        */

        setEditing(false);

        setConfirmationOpen(
          false
        );

        setSuspensionOpen(
          false
        );

        setReactivationOpen(
          false
        );

        setDeactivationOpen(
          false
        );

        setTransferOpen(
          false
        );

        setPromotionOpen(
          false
        );

        setJobChangeOpen(
          true
        );

        setJobChangeCatalogLoading(
          true
        );

        setJobChangeCatalog(
          []
        );

        setJobChangeForm({
          departmentId: "",
          designationId: "",
          effectiveDate:
            new Date()
              .toISOString()
              .slice(0, 10),
          reason: "",
          notes: "",
        });

        /*
        Load the organization's current designation catalogue.

        Target departments are derived from active,
        department-mapped designations.
        */

        const result =
          await apiRequest(
            "/api/employees/career/catalog"
          );

        const catalog =
          (result.data || [])
            .filter(
              (designation) =>
                designation.isActive !==
                  false &&
                designation.department?.id
            );

        setJobChangeCatalog(
          catalog
        );

        /*
        Default the target department to the employee's
        current department where possible.

        The designation remains blank so HR must explicitly
        select the intended target role.
        */

        const currentDesignation =
          catalog.find(
            (designation) =>
              designation.name ===
                profile.designation &&
              designation.department
                ?.name ===
                profile.department
          );

        const currentDepartmentId =
          currentDesignation
            ?.department?.id ||
          catalog.find(
            (designation) =>
              designation.department
                ?.name ===
                profile.department
          )?.department?.id ||
          "";

        setJobChangeForm(
          (current) => ({
            ...current,
            departmentId:
              currentDepartmentId,
          })
        );
      } catch (err) {
        console.error(
          "Job Change catalogue load error:",
          err
        );

        setJobChangeCatalog(
          []
        );

        setError(
          err.message ||
            "CHRIS could not load valid job-change positions."
        );
      } finally {
        setJobChangeCatalogLoading(
          false
        );
      }
    };


  /*
  ============================================================
  JOB CHANGE FORM CHANGE
  ============================================================
  */

  const handleJobChangeChange =
    (event) => {
      const {
        name,
        value,
      } = event.target;

      setJobChangeForm(
        (current) => {
          /*
          Changing department invalidates the previously
          selected target designation.
          */

          if (
            name ===
            "departmentId"
          ) {
            return {
              ...current,
              departmentId:
                value,
              designationId:
                "",
            };
          }

          return {
            ...current,
            [name]:
              value,
          };
        }
      );
    };


  /*
  ============================================================
  CANCEL JOB CHANGE
  ============================================================
  */

  const cancelJobChange =
    () => {
      setJobChangeOpen(
        false
      );

      setJobChangeCatalog(
        []
      );

      setJobChangeForm({
        departmentId: "",
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
  PROCESS CONTROLLED EMPLOYEE JOB CHANGE
  ============================================================
  */

  const handleJobChange =
    async (event) => {
      event.preventDefault();

      if (
        !jobChangeForm.departmentId
      ) {
        setError(
          "Select the target department."
        );

        return;
      }

      if (
        !jobChangeForm.designationId
      ) {
        setError(
          "Select the target designation."
        );

        return;
      }

      if (
        !jobChangeForm.effectiveDate
      ) {
        setError(
          "Job Change effective date is required."
        );

        return;
      }

      if (
        !jobChangeForm.reason
          .trim()
      ) {
        setError(
          "A reason is required for a Job Change."
        );

        return;
      }

      const selectedDesignation =
        jobChangeCatalog.find(
          (designation) =>
            designation.id ===
              jobChangeForm
                .designationId
        );

      if (!selectedDesignation) {
        setError(
          "The selected designation is no longer available."
        );

        return;
      }

      if (
        selectedDesignation
          .department?.id !==
        jobChangeForm.departmentId
      ) {
        setError(
          "The selected designation does not belong to the selected department."
        );

        return;
      }

      /*
      Prevent a no-change transaction in the UI.

      The backend independently enforces this rule.
      */

      if (
        selectedDesignation.name ===
          profile.designation &&
        selectedDesignation
          .department?.name ===
          profile.department
      ) {
        setError(
          "Select a different department or designation before recording a Job Change."
        );

        return;
      }

      try {
        setJobChangeSaving(
          true
        );

        setError("");
        setSuccess("");

        const result =
          await apiRequest(
            `/api/employees/${encodeURIComponent(
              employeeNumber
            )}/job-change`,
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  departmentId:
                    jobChangeForm
                      .departmentId,

                  designationId:
                    jobChangeForm
                      .designationId,

                  effectiveDate:
                    jobChangeForm
                      .effectiveDate,

                  reason:
                    jobChangeForm
                      .reason
                      .trim(),

                  notes:
                    jobChangeForm
                      .notes
                      .trim(),
                }),
            }
          );

        /*
        Refresh the employee master record and permanent
        Employment History together.
        */

        await Promise.all([
          loadProfile(),
          loadLifecycleHistory(),
        ]);

        setJobChangeOpen(
          false
        );

        setJobChangeCatalog(
          []
        );

        setJobChangeForm({
          departmentId: "",
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
            "Employee Job Change recorded successfully."
        );

        setTimeout(() => {
          setSuccess("");
        }, 4000);
      } catch (err) {
        console.error(
          "Employee Job Change error:",
          err
        );

        setError(
          err.message ||
            "CHRIS could not process this Job Change."
        );
      } finally {
        setJobChangeSaving(
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

        setConfirmationOpen(
          false
        );

        setSuspensionOpen(
          false
        );

        setReactivationOpen(
          false
        );

        setDeactivationOpen(
          false
        );

        setTransferOpen(
          false
        );

      setJobChangeOpen(
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
  /*
  ============================================================
  OPEN EMPLOYMENT CONFIRMATION
  ============================================================
  */

  const openConfirmationForm =
    () => {
      setError("");
      setSuccess("");

      setTransferOpen(false);
      setJobChangeOpen(false);
      setPromotionOpen(false);
      setSuspensionOpen(false);
      setReactivationOpen(false);
      setDeactivationOpen(false);
      setEditing(false);

      setConfirmationForm({
        effectiveDate:
          new Date()
            .toISOString()
            .slice(0, 10),

        reason:
          "Employment confirmed",

        notes: "",
      });

      setConfirmationOpen(true);
    };


  /*
  ============================================================
  CONFIRMATION FORM CHANGE
  ============================================================
  */

  const handleConfirmationChange =
    (event) => {
      const {
        name,
        value,
      } = event.target;

      setConfirmationForm(
        (current) => ({
          ...current,

          [name]:
            value,
        })
      );
    };


  /*
  ============================================================
  CANCEL EMPLOYMENT CONFIRMATION
  ============================================================
  */

  const cancelConfirmation =
    () => {
      setConfirmationOpen(false);

      setConfirmationForm({
        effectiveDate:
          new Date()
            .toISOString()
            .slice(0, 10),

        reason:
          "Employment confirmed",

        notes: "",
      });

      setError("");
    };


  /*
  ============================================================
  PROCESS EMPLOYMENT CONFIRMATION
  ============================================================
  */

  const handleConfirmation =
    async (event) => {
      event.preventDefault();

      if (
        !confirmationForm.effectiveDate
      ) {
        setError(
          "Confirmation effective date is required."
        );

        return;
      }

      try {
        setConfirmationSaving(true);

        setError("");
        setSuccess("");

        const result =
          await apiRequest(
            `/api/employees/${encodeURIComponent(
              employeeNumber
            )}/confirm`,
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  effectiveDate:
                    confirmationForm.effectiveDate,

                  reason:
                    confirmationForm.reason
                      .trim(),

                  notes:
                    confirmationForm.notes
                      .trim(),
                }),
            }
          );

        /*
        Refresh both the current employee record and
        permanent Employment History.
        */

        await Promise.all([
          loadProfile(),
          loadLifecycleHistory(),
        ]);

        setConfirmationOpen(false);

        setConfirmationForm({
          effectiveDate:
            new Date()
              .toISOString()
              .slice(0, 10),

          reason:
            "Employment confirmed",

          notes: "",
        });

        setSuccess(
          result.message ||
            "Employment confirmed successfully."
        );

        setTimeout(() => {
          setSuccess("");
        }, 4000);
      } catch (err) {
        console.error(
          "Employee confirmation error:",
          err
        );

        setError(
          err.message ||
            "CHRIS could not confirm this employee."
        );
      } finally {
        setConfirmationSaving(false);
      }
    };

  /*
  ============================================================
  OPEN EMPLOYEE SUSPENSION FORM
  ============================================================
  */

  const openSuspensionForm =
    () => {
      setError("");
      setSuccess("");

      /*
      Keep controlled employee transactions mutually exclusive.
      */

      setEditing(false);

      setConfirmationOpen(
        false
      );

      setTransferOpen(
        false
      );

      setJobChangeOpen(
        false
      );

      setPromotionOpen(
        false
      );

      setReactivationOpen(
        false
      );

      setDeactivationOpen(
        false
      );

      setSuspensionForm({
        effectiveDate:
          new Date()
            .toISOString()
            .slice(0, 10),

        suspensionEndDate: "",

        reason: "",

        notes: "",
      });

      setSuspensionOpen(
        true
      );
    };


  /*
  ============================================================
  SUSPENSION FORM CHANGE
  ============================================================
  */

  const handleSuspensionChange =
    (event) => {
      const {
        name,
        value,
      } = event.target;

      setSuspensionForm(
        (current) => ({
          ...current,

          [name]:
            value,
        })
      );
    };


  /*
  ============================================================
  CANCEL EMPLOYEE SUSPENSION
  ============================================================
  */

  const cancelSuspension =
    () => {
      setSuspensionOpen(
        false
      );

      setSuspensionForm({
        effectiveDate:
          new Date()
            .toISOString()
            .slice(0, 10),

        suspensionEndDate: "",

        reason: "",

        notes: "",
      });

      setError("");
    };


  /*
  ============================================================
  PROCESS EMPLOYEE SUSPENSION
  ============================================================
  */

  const handleSuspension =
    async (event) => {
      event.preventDefault();


      /*
      ----------------------------------------------------------
      CLIENT-SIDE ELIGIBILITY CHECK

      Backend independently validates suspension eligibility.
      ----------------------------------------------------------
      */

      if (
        [
          "Resigned",
          "Terminated",
          "Retired",
          "Suspended",
          "Inactive",
        ].includes(
          profile.status
        )
      ) {
        setError(
          "This employee is not eligible for suspension in the current employment status."
        );

        return;
      }

            /*
      ----------------------------------------------------------
      REQUIRED EFFECTIVE DATE
      ----------------------------------------------------------
      */

      if (
        !suspensionForm.effectiveDate
      ) {
        setError(
          "Suspension effective date is required."
        );

        return;
      }


      /*
      ----------------------------------------------------------
      REQUIRED SUSPENSION END DATE
      ----------------------------------------------------------
      */

      if (
        !suspensionForm.suspensionEndDate
      ) {
        setError(
          "Suspension end date is required."
        );

        return;
      }


      /*
      ----------------------------------------------------------
      SUSPENSION PERIOD VALIDATION
      ----------------------------------------------------------
      */

      if (
        new Date(
          suspensionForm.suspensionEndDate
        ) <
        new Date(
          suspensionForm.effectiveDate
        )
      ) {
        setError(
          "Suspension end date cannot be earlier than the effective date."
        );

        return;
      }


      /*
      ----------------------------------------------------------
      REQUIRED REASON
      ----------------------------------------------------------
      */

      if (
        !suspensionForm.reason
          .trim()
      ) {
        setError(
          "A reason is required to suspend an employee."
        );

        return;
      }


      try {
        setSuspensionSaving(
          true
        );

        setError("");
        setSuccess("");


        const result =
          await apiRequest(
            `/api/employees/${encodeURIComponent(
              employeeNumber
            )}/suspend`,
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  effectiveDate:
                    suspensionForm.effectiveDate,

                  suspensionEndDate:
                    suspensionForm.suspensionEndDate,

                  reason:
                    suspensionForm.reason
                      .trim(),

                  notes:
                    suspensionForm.notes
                      .trim(),
                }),
            }
          );


        /*
        Refresh both the employee master record and
        permanent Employment History.
        */

        await Promise.all([
          loadProfile(),
          loadLifecycleHistory(),
        ]);


        setSuspensionOpen(
          false
        );

        setSuspensionForm({
          effectiveDate:
            new Date()
              .toISOString()
              .slice(0, 10),

          suspensionEndDate: "",

          reason: "",

          notes: "",
        });


        setSuccess(
          result.message ||
            "Employee suspended successfully."
        );


        setTimeout(() => {
          setSuccess("");
        }, 4000);
      } catch (err) {
        console.error(
          "Employee suspension error:",
          err
        );

        setError(
          err.message ||
            "CHRIS could not suspend this employee."
        );
      } finally {
        setSuspensionSaving(
          false
        );
      }
    };


  /*
  ============================================================
  OPEN EMPLOYEE REACTIVATION FORM
  ============================================================
  */

  const openReactivationForm =
    () => {
      setError("");
      setSuccess("");

      /*
      Keep controlled employee transactions mutually exclusive.
      */

      setEditing(false);

      setConfirmationOpen(
        false
      );

      setSuspensionOpen(
        false
      );

      setTransferOpen(
        false
      );

      setJobChangeOpen(
        false
      );

      setPromotionOpen(
        false
      );

      setReactivationForm({
        effectiveDate:
          new Date()
            .toISOString()
            .slice(0, 10),

        reason: "",

        notes: "",
      });

      setReactivationOpen(
        true
      );
    };


  /*
  ============================================================
  REACTIVATION FORM CHANGE
  ============================================================
  */

  const handleReactivationChange =
    (event) => {
      const {
        name,
        value,
      } = event.target;

      setReactivationForm(
        (current) => ({
          ...current,

          [name]:
            value,
        })
      );
    };


  /*
  ============================================================
  CANCEL EMPLOYEE REACTIVATION
  ============================================================
  */

  const cancelReactivation =
    () => {
      setReactivationOpen(
        false
      );

      setDeactivationOpen(
        false
      );

      setReactivationForm({
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
  PROCESS EMPLOYEE REACTIVATION
  ============================================================
  */

  const handleReactivation =
    async (event) => {
      event.preventDefault();


      /*
      ----------------------------------------------------------
      CLIENT-SIDE ELIGIBILITY CHECK

      The backend independently enforces the same rule.
      ----------------------------------------------------------
      */

      if (
        ![
          "Suspended",
          "Inactive",
        ].includes(
          profile.status
        )
      ) {
        setError(
          "Only a suspended or inactive employee can be reactivated."
        );

        return;
      }


      if (
        !reactivationForm.effectiveDate
      ) {
        setError(
          "Reactivation effective date is required."
        );

        return;
      }


      if (
        !reactivationForm.reason
          .trim()
      ) {
        setError(
          "A reason is required to reactivate an employee."
        );

        return;
      }


      try {
        setReactivationSaving(
          true
        );

        setError("");
        setSuccess("");


        const result =
          await apiRequest(
            `/api/employees/${encodeURIComponent(
              employeeNumber
            )}/reactivate`,
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  effectiveDate:
                    reactivationForm.effectiveDate,

                  reason:
                    reactivationForm.reason
                      .trim(),

                  notes:
                    reactivationForm.notes
                      .trim(),
                }),
            }
          );


        /*
        Refresh employee master record and permanent
        Employment History together.
        */

        await Promise.all([
          loadProfile(),
          loadLifecycleHistory(),
        ]);


        setReactivationOpen(
          false
        );

        setDeactivationOpen(
          false
        );

        setReactivationForm({
          effectiveDate:
            new Date()
              .toISOString()
              .slice(0, 10),

          reason: "",

          notes: "",
        });


        setSuccess(
          result.message ||
            "Employee reactivated successfully."
        );


        setTimeout(() => {
          setSuccess("");
        }, 4000);
      } catch (err) {
        console.error(
          "Employee reactivation error:",
          err
        );

        setError(
          err.message ||
            "CHRIS could not reactivate this employee."
        );
      } finally {
        setReactivationSaving(
          false
        );
      }
    };


  /*
  ============================================================
  OPEN EMPLOYEE DEACTIVATION FORM
  ============================================================
  */

  const openDeactivationForm =
    () => {
      setError("");
      setSuccess("");

      setEditing(false);
      setConfirmationOpen(false);
      setSuspensionOpen(false);
      setReactivationOpen(false);
      setTransferOpen(false);
      setJobChangeOpen(false);
      setPromotionOpen(false);

      setDeactivationForm({
        effectiveDate:
          new Date()
            .toISOString()
            .slice(0, 10),
        reason: "",
        notes: "",
      });

      setDeactivationOpen(true);
    };


  const handleDeactivationChange =
    (event) => {
      const {
        name,
        value,
      } = event.target;

      setDeactivationForm(
        (current) => ({
          ...current,
          [name]: value,
        })
      );
    };


  const cancelDeactivation =
    () => {
      setDeactivationOpen(false);

      setDeactivationForm({
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
  PROCESS CONTROLLED EMPLOYEE DEACTIVATION
  ============================================================
  */

  const handleDeactivation =
    async (event) => {
      event.preventDefault();

      if (
        [
          "Resigned",
          "Terminated",
          "Retired",
          "Suspended",
          "Inactive",
        ].includes(profile.status)
      ) {
        setError(
          "This employee is not eligible for deactivation in the current employment status."
        );
        return;
      }

      if (!deactivationForm.effectiveDate) {
        setError(
          "Deactivation effective date is required."
        );
        return;
      }

      if (!deactivationForm.reason.trim()) {
        setError(
          "A reason is required to deactivate an employee."
        );
        return;
      }

      try {
        setDeactivationSaving(true);
        setError("");
        setSuccess("");

        const result =
          await apiRequest(
            `/api/employees/${encodeURIComponent(
              employeeNumber
            )}/deactivate`,
            {
              method: "PATCH",
              body: JSON.stringify({
                effectiveDate:
                  deactivationForm.effectiveDate,
                reason:
                  deactivationForm.reason.trim(),
                notes:
                  deactivationForm.notes.trim(),
              }),
            }
          );

        await Promise.all([
          loadProfile(),
          loadLifecycleHistory(),
        ]);

        setDeactivationOpen(false);
        setDeactivationForm({
          effectiveDate:
            new Date()
              .toISOString()
              .slice(0, 10),
          reason: "",
          notes: "",
        });

        setSuccess(
          result.message ||
            "Employee deactivated successfully."
        );

        setTimeout(() => {
          setSuccess("");
        }, 4000);
      } catch (err) {
        console.error(
          "Employee deactivation error:",
          err
        );

        setError(
          err.message ||
            "CHRIS could not deactivate this employee."
        );
      } finally {
        setDeactivationSaving(false);
      }
    };


  /*
  ============================================================
  OPEN CONTROLLED ACTION REQUESTED FROM EMPLOYEE DIRECTORY
  ============================================================

  Employee Directory routes controlled lifecycle transactions
  to Employee Profile so HR completes the authoritative form
  before CHRIS submits the transaction.
  ============================================================
  */

  useEffect(() => {
    if (!profile) {
      return;
    }

    const params =
      new URLSearchParams(
        window.location.search
      );

    const requestedAction =
      params.get("action");

    if (
      requestedAction ===
        "suspend" &&
      ![
        "Resigned",
        "Terminated",
        "Retired",
        "Suspended",
        "Inactive",
      ].includes(
        profile.status
      )
    ) {
      openSuspensionForm();
    }

    if (
      requestedAction ===
        "deactivate" &&
      ![
        "Resigned",
        "Terminated",
        "Retired",
        "Suspended",
        "Inactive",
      ].includes(
        profile.status
      )
    ) {
      openDeactivationForm();
    }

    if (
      requestedAction ===
        "reactivate" &&
      [
        "Suspended",
        "Inactive",
      ].includes(
        profile.status
      )
    ) {
      openReactivationForm();
    }

    if (requestedAction) {
      window.history.replaceState(
        {},
        "",
        window.location.pathname
      );
    }
  }, [
    profile?.status,
    employeeNumber,
  ]);


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
                Work Location / Branch
              </label>

              {profile.locationId ? (
                <>
                  <input
                    type="text"
                    value={`${profile.locationName}${
                      profile.locationCode
                        ? ` (${profile.locationCode})`
                        : ""
                    }`}
                    readOnly
                    disabled
                    style={{
                      ...fieldStyle,
                      background:
                        "#F8FAFC",
                      color:
                        "#475569",
                      cursor:
                        "not-allowed",
                    }}
                  />

                  <p
                    style={{
                      margin:
                        "7px 0 0",
                      color:
                        "#64748B",
                      fontSize:
                        "12px",
                      lineHeight:
                        "1.45",
                    }}
                  >
                    Work location is already established. Use
                    Transfer Employee for any movement to another
                    location.
                  </p>
                </>
              ) : (
                <>
                  <select
                    name="locationId"
                    value={
                      formData.locationId ||
                      ""
                    }
                    onChange={
                      handleChange
                    }
                    required
                    disabled={
                      saving
                    }
                    style={
                      fieldStyle
                    }
                  >
                    <option value="">
                      Select work location / branch
                    </option>

                    {locations.map(
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
                          {location.city
                            ? ` - ${location.city}`
                            : ""}
                        </option>
                      )
                    )}
                  </select>

                  <p
                    style={{
                      margin:
                        "7px 0 0",
                      color:
                        "#B45309",
                      fontSize:
                        "12px",
                      lineHeight:
                        "1.45",
                    }}
                  >
                    Initial assignment only. After a location is
                    established, future changes must use Transfer
                    Employee.
                  </p>
                </>
              )}
            </div>

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
                onClick={
                  openEditForm
                }
                style={
                  actionButtonStyle
                }
              >
                Edit Employee
              </button>
              {profile.status ===
                "Probation" && (
                <button
                  type="button"
                  onClick={
                    openConfirmationForm
                  }
                  style={
                    actionButtonStyle
                  }
                >
                  Confirm Employment
                </button>
              )}
              {![
                "Resigned",
                "Terminated",
                "Retired",
                "Suspended",
                "Inactive",
              ].includes(
                profile.status
              ) && (
                <button
                  type="button"
                  onClick={
                    openSuspensionForm
                  }
                  style={
                    actionButtonStyle
                  }
                >
                  Suspend Employee
                </button>
              )}

              {![
                "Resigned",
                "Terminated",
                "Retired",
                "Suspended",
                "Inactive",
              ].includes(
                profile.status
              ) && (
                <button
                  type="button"
                  onClick={
                    openDeactivationForm
                  }
                  style={
                    actionButtonStyle
                  }
                >
                  Deactivate Employee
                </button>
              )}

              {[
                "Suspended",
                "Inactive",
              ].includes(
                profile.status
              ) && (
                <button
                  type="button"
                  onClick={
                    openReactivationForm
                  }
                  style={
                    actionButtonStyle
                  }
                >
                  Reactivate Employee
                </button>
              )}

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
              openJobChangeForm
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
            Job Change
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
      {confirmationOpen &&
        !editing && (
        <form
          onSubmit={
            handleConfirmation
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
                Employment Lifecycle
              </p>

              <h2
                style={
                  transferTitleStyle
                }
              >
                Confirm Employment
              </h2>

              <p
                style={
                  transferSubtitleStyle
                }
              >
                Confirm this employee's probation and
                transition the employment status to Active.
              </p>
            </div>

            <button
              type="button"
              onClick={
                cancelConfirmation
              }
              disabled={
                confirmationSaving
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
                Current Status
              </span>

              <strong
                style={
                  transferSummaryValueStyle
                }
              >
                {profile.status}
              </strong>
            </div>

            <div>
              <span
                style={
                  transferSummaryLabelStyle
                }
              >
                New Status
              </span>

              <strong
                style={
                  transferSummaryValueStyle
                }
              >
                Active
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
                Confirmation Effective Date *
              </label>

              <input
                type="date"
                name="effectiveDate"
                value={
                  confirmationForm.effectiveDate
                }
                onChange={
                  handleConfirmationChange
                }
                disabled={
                  confirmationSaving
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
                  confirmationForm.reason
                }
                onChange={
                  handleConfirmationChange
                }
                disabled={
                  confirmationSaving
                }
                placeholder="e.g. Successful completion of probation"
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
                confirmationForm.notes
              }
              onChange={
                handleConfirmationChange
              }
              disabled={
                confirmationSaving
              }
              placeholder="Optional HR notes concerning this employment confirmation..."
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
                cancelConfirmation
              }
              disabled={
                confirmationSaving
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
                confirmationSaving ||
                !confirmationForm.effectiveDate
              }
              style={{
                ...transferConfirmButtonStyle,

                opacity:
                  confirmationSaving ||
                  !confirmationForm.effectiveDate
                    ? 0.6
                    : 1,

                cursor:
                  confirmationSaving ||
                  !confirmationForm.effectiveDate
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {confirmationSaving
                ? "Confirming..."
                : "Confirm Employment"}
            </button>
          </div>
        </form>
      )}
            {suspensionOpen &&
        !editing && (
        <form
          onSubmit={
            handleSuspension
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
                Employment Lifecycle
              </p>

              <h2
                style={
                  transferTitleStyle
                }
              >
                Suspend Employee
              </h2>

              <p
                style={
                  transferSubtitleStyle
                }
              >
                Record a controlled employee suspension period
                while preserving the permanent employment history.
              </p>
            </div>

            <button
              type="button"
              onClick={
                cancelSuspension
              }
              disabled={
                suspensionSaving
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
                Current Status
              </span>

              <strong
                style={
                  transferSummaryValueStyle
                }
              >
                {profile.status}
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
                Suspension Effective Date *
              </label>

              <input
                type="date"
                name="effectiveDate"
                value={
                  suspensionForm.effectiveDate
                }
                onChange={
                  handleSuspensionChange
                }
                disabled={
                  suspensionSaving
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
                Suspension End Date *
              </label>

              <input
                type="date"
                name="suspensionEndDate"
                value={
                  suspensionForm.suspensionEndDate
                }
                onChange={
                  handleSuspensionChange
                }
                min={
                  suspensionForm.effectiveDate
                }
                disabled={
                  suspensionSaving
                }
                required
                style={
                  fieldStyle
                }
              />
            </div>
          </div>


          {suspensionForm.effectiveDate &&
            suspensionForm.suspensionEndDate && (
              <div
                style={{
                  ...promotionOptionsMessageStyle,

                  marginTop:
                    "18px",
                }}
              >
                <strong>
                  Suspension Period
                </strong>

                <div
                  style={{
                    marginTop:
                      "7px",
                  }}
                >
                  {formatDate(
                    suspensionForm.effectiveDate
                  )}
                  {" → "}
                  {formatDate(
                    suspensionForm.suspensionEndDate
                  )}
                </div>

                <div
                  style={{
                    marginTop:
                      "3px",
                  }}
                >
                  Duration:{" "}
                  <strong>
                    {Math.floor(
                      (
                        new Date(
                          suspensionForm.suspensionEndDate
                        ) -
                        new Date(
                          suspensionForm.effectiveDate
                        )
                      ) /
                        (
                          1000 *
                          60 *
                          60 *
                          24
                        )
                    ) + 1}{" "}
                    calendar day(s)
                  </strong>
                </div>
              </div>
            )}


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
              Reason *
            </label>

            <input
              type="text"
              name="reason"
              value={
                suspensionForm.reason
              }
              onChange={
                handleSuspensionChange
              }
              disabled={
                suspensionSaving
              }
              required
              placeholder="e.g. Pending disciplinary investigation"
              style={
                fieldStyle
              }
            />
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
                suspensionForm.notes
              }
              onChange={
                handleSuspensionChange
              }
              disabled={
                suspensionSaving
              }
              placeholder="Optional HR notes concerning this suspension..."
              rows={4}
              style={
                transferTextareaStyle
              }
            />
          </div>


          <div
            style={{
              ...promotionOptionsMessageStyle,

              marginTop:
                "18px",
            }}
          >
            Submitting this suspension will change the employee's
            status to Suspended and disable linked CHRIS access.

            The recorded suspension end date represents the expected
            expiry or review date. Reactivation remains a separate
            controlled HR transaction.
          </div>


          <div
            style={
              transferFooterStyle
            }
          >
            <button
              type="button"
              onClick={
                cancelSuspension
              }
              disabled={
                suspensionSaving
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
                suspensionSaving ||
                !suspensionForm.effectiveDate ||
                !suspensionForm.suspensionEndDate ||
                !suspensionForm.reason.trim()
              }
              style={{
                ...transferConfirmButtonStyle,

                opacity:
                  suspensionSaving ||
                  !suspensionForm.effectiveDate ||
                  !suspensionForm.suspensionEndDate ||
                  !suspensionForm.reason.trim()
                    ? 0.6
                    : 1,

                cursor:
                  suspensionSaving ||
                  !suspensionForm.effectiveDate ||
                  !suspensionForm.suspensionEndDate ||
                  !suspensionForm.reason.trim()
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {suspensionSaving
                ? "Suspending..."
                : "Suspend Employee"}
            </button>
          </div>
        </form>
      )}

      {deactivationOpen &&
        !editing && (
        <form
          onSubmit={
            handleDeactivation
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
                Employment Lifecycle
              </p>

              <h2
                style={
                  transferTitleStyle
                }
              >
                Deactivate Employee
              </h2>

              <p
                style={
                  transferSubtitleStyle
                }
              >
                Place this employee in Inactive status without
                recording an employment exit.
              </p>
            </div>

            <button
              type="button"
              onClick={
                cancelDeactivation
              }
              disabled={
                deactivationSaving
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
                Current Status
              </span>

              <strong
                style={
                  transferSummaryValueStyle
                }
              >
                {profile.status}
              </strong>
            </div>
          </div>

          <div
            style={
              transferGridStyle
            }
          >
            <div>
              <label style={labelStyle}>
                Deactivation Effective Date *
              </label>

              <input
                type="date"
                name="effectiveDate"
                value={
                  deactivationForm.effectiveDate
                }
                onChange={
                  handleDeactivationChange
                }
                disabled={
                  deactivationSaving
                }
                required
                style={fieldStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>
                Reason *
              </label>

              <input
                type="text"
                name="reason"
                value={
                  deactivationForm.reason
                }
                onChange={
                  handleDeactivationChange
                }
                disabled={
                  deactivationSaving
                }
                required
                placeholder="e.g. Temporary inactive employment status"
                style={fieldStyle}
              />
            </div>
          </div>

          <div
            style={{
              marginTop: "18px",
            }}
          >
            <label style={labelStyle}>
              Notes
            </label>

            <textarea
              name="notes"
              value={
                deactivationForm.notes
              }
              onChange={
                handleDeactivationChange
              }
              disabled={
                deactivationSaving
              }
              placeholder="Optional HR notes concerning this deactivation..."
              rows={4}
              style={
                transferTextareaStyle
              }
            />
          </div>

          <div
            style={{
              ...promotionOptionsMessageStyle,
              marginTop: "18px",
            }}
          >
            Submitting this transaction will change the employee
            to Inactive status and disable linked CHRIS access.
            This is not an exit transaction and the employee can
            later be reactivated through the controlled Reactivate
            Employee process.
          </div>

          <div style={transferFooterStyle}>
            <button
              type="button"
              onClick={cancelDeactivation}
              disabled={deactivationSaving}
              style={cancelButtonStyle}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                deactivationSaving ||
                !deactivationForm.effectiveDate ||
                !deactivationForm.reason.trim()
              }
              style={{
                ...transferConfirmButtonStyle,
                opacity:
                  deactivationSaving ||
                  !deactivationForm.effectiveDate ||
                  !deactivationForm.reason.trim()
                    ? 0.6
                    : 1,
                cursor:
                  deactivationSaving ||
                  !deactivationForm.effectiveDate ||
                  !deactivationForm.reason.trim()
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {deactivationSaving
                ? "Deactivating..."
                : "Deactivate Employee"}
            </button>
          </div>
        </form>
      )}

      {reactivationOpen &&
        !editing && (
        <form
          onSubmit={
            handleReactivation
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
                Employment Lifecycle
              </p>

              <h2
                style={
                  transferTitleStyle
                }
              >
                Reactivate Employee
              </h2>

              <p
                style={
                  transferSubtitleStyle
                }
              >
                Return this employee to active employment status
                and restore linked CHRIS access.
              </p>
            </div>

            <button
              type="button"
              onClick={
                cancelReactivation
              }
              disabled={
                reactivationSaving
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
                Current Status
              </span>

              <strong
                style={
                  transferSummaryValueStyle
                }
              >
                {profile.status}
              </strong>
            </div>

            {profile.status ===
              "Suspended" &&
              profile.suspensionEndDate && (
                <div>
                  <span
                    style={
                      transferSummaryLabelStyle
                    }
                  >
                    Suspension Review Date
                  </span>

                  <strong
                    style={
                      transferSummaryValueStyle
                    }
                  >
                    {formatDate(
                      profile.suspensionEndDate
                    )}
                  </strong>
                </div>
              )}
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
                Reactivation Effective Date *
              </label>

              <input
                type="date"
                name="effectiveDate"
                value={
                  reactivationForm.effectiveDate
                }
                onChange={
                  handleReactivationChange
                }
                disabled={
                  reactivationSaving
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
                Reason *
              </label>

              <input
                type="text"
                name="reason"
                value={
                  reactivationForm.reason
                }
                onChange={
                  handleReactivationChange
                }
                disabled={
                  reactivationSaving
                }
                required
                placeholder="e.g. Suspension review completed"
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
                reactivationForm.notes
              }
              onChange={
                handleReactivationChange
              }
              disabled={
                reactivationSaving
              }
              placeholder="Optional HR notes concerning this reactivation..."
              rows={4}
              style={
                transferTextareaStyle
              }
            />
          </div>


          <div
            style={{
              ...promotionOptionsMessageStyle,

              marginTop:
                "18px",
            }}
          >
            Submitting this reactivation will return the employee
            to Active status and restore linked CHRIS access.

            The original suspension period remains permanently
            preserved in Employment History.
          </div>


          <div
            style={
              transferFooterStyle
            }
          >
            <button
              type="button"
              onClick={
                cancelReactivation
              }
              disabled={
                reactivationSaving
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
                reactivationSaving ||
                !reactivationForm.effectiveDate ||
                !reactivationForm.reason.trim()
              }
              style={{
                ...transferConfirmButtonStyle,

                opacity:
                  reactivationSaving ||
                  !reactivationForm.effectiveDate ||
                  !reactivationForm.reason.trim()
                    ? 0.6
                    : 1,

                cursor:
                  reactivationSaving ||
                  !reactivationForm.effectiveDate ||
                  !reactivationForm.reason.trim()
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {reactivationSaving
                ? "Reactivating..."
                : "Reactivate Employee"}
            </button>
          </div>
        </form>
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
  {jobChangeOpen &&
    !editing && (
    <form
      onSubmit={
        handleJobChange
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
            Employee Movement
          </p>

          <h2
            style={
              promotionTitleStyle
            }
          >
            Job Change
          </h2>

          <p
            style={
              promotionSubtitleStyle
            }
          >
            Record a controlled lateral move, department
            reassignment, role reclassification, designation
            correction, or organizational restructuring.
          </p>
        </div>

        <button
          type="button"
          onClick={
            cancelJobChange
          }
          disabled={
            jobChangeSaving
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
          promotionOptionsMessageStyle
        }
      >
        <strong>
          Current Assignment
        </strong>

        <div
          style={{
            marginTop:
              "7px",
          }}
        >
          Department:{" "}
          <strong>
            {
              profile.department ||
              "Not Assigned"
            }
          </strong>
        </div>

        <div
          style={{
            marginTop:
              "3px",
          }}
        >
          Designation:{" "}
          <strong>
            {
              profile.designation ||
              "Not Assigned"
            }
          </strong>
        </div>
      </div>


      {jobChangeCatalogLoading ? (
        <div
          style={
            promotionOptionsMessageStyle
          }
        >
          Loading available departments and designations...
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
                New Department *
              </label>

              <select
                name="departmentId"
                value={
                  jobChangeForm
                    .departmentId
                }
                onChange={
                  handleJobChangeChange
                }
                disabled={
                  jobChangeSaving
                }
                required
                style={
                  fieldStyle
                }
              >
                <option value="">
                  Select department
                </option>

                {Array.from(
                  new Map(
                    jobChangeCatalog
                      .filter(
                        (designation) =>
                          designation
                            .department?.id
                      )
                      .map(
                        (designation) => [
                          designation
                            .department
                            .id,
                          designation
                            .department,
                        ]
                      )
                  ).values()
                )
                  .sort(
                    (a, b) =>
                      a.name.localeCompare(
                        b.name
                      )
                  )
                  .map(
                    (department) => (
                      <option
                        key={
                          department.id
                        }
                        value={
                          department.id
                        }
                      >
                        {
                          department.name
                        }
                      </option>
                    )
                  )}
              </select>

              <p
                style={
                  promotionFieldHintStyle
                }
              >
                Select the organizational department that will
                own the employee's new role.
              </p>
            </div>


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
                  jobChangeForm
                    .designationId
                }
                onChange={
                  handleJobChangeChange
                }
                disabled={
                  jobChangeSaving ||
                  !jobChangeForm
                    .departmentId
                }
                required
                style={
                  fieldStyle
                }
              >
                <option value="">
                  Select designation
                </option>

                {jobChangeCatalog
                  .filter(
                    (designation) =>
                      designation
                        .department?.id ===
                      jobChangeForm
                        .departmentId
                  )
                  .sort(
                    (a, b) => {
                      const levelA =
                        a.careerLevel ??
                        999999;

                      const levelB =
                        b.careerLevel ??
                        999999;

                      if (
                        levelA !==
                        levelB
                      ) {
                        return (
                          levelA -
                          levelB
                        );
                      }

                      return a.name
                        .localeCompare(
                          b.name
                        );
                    }
                  )
                  .map(
                    (designation) => (
                      <option
                        key={
                          designation.id
                        }
                        value={
                          designation.id
                        }
                      >
                        {
                          designation.name
                        }
                        {
                          designation
                            .careerLevel !=
                          null
                            ? ` - Level ${designation.careerLevel}`
                            : ""
                        }
                      </option>
                    )
                  )}
              </select>

              <p
                style={
                  promotionFieldHintStyle
                }
              >
                Only active designations mapped to the selected
                department are available.
              </p>
            </div>
          </div>


          <div
            style={{
              ...promotionGridStyle,
              marginTop:
                "18px",
            }}
          >
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
                  jobChangeForm
                    .effectiveDate
                }
                onChange={
                  handleJobChangeChange
                }
                disabled={
                  jobChangeSaving
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
                Reason *
              </label>

              <input
                type="text"
                name="reason"
                value={
                  jobChangeForm.reason
                }
                onChange={
                  handleJobChangeChange
                }
                disabled={
                  jobChangeSaving
                }
                required
                placeholder="e.g. Role reclassification"
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
                jobChangeForm.notes
              }
              onChange={
                handleJobChangeChange
              }
              disabled={
                jobChangeSaving
              }
              placeholder="Optional HR notes concerning this Job Change..."
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
                cancelJobChange
              }
              disabled={
                jobChangeSaving
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
                jobChangeSaving ||
                !jobChangeForm
                  .departmentId ||
                !jobChangeForm
                  .designationId ||
                !jobChangeForm
                  .effectiveDate ||
                !jobChangeForm
                  .reason
                  .trim()
              }
              style={{
                ...promotionConfirmButtonStyle,

                opacity:
                  jobChangeSaving ||
                  !jobChangeForm
                    .departmentId ||
                  !jobChangeForm
                    .designationId ||
                  !jobChangeForm
                    .effectiveDate ||
                  !jobChangeForm
                    .reason
                    .trim()
                    ? 0.6
                    : 1,

                cursor:
                  jobChangeSaving ||
                  !jobChangeForm
                    .departmentId ||
                  !jobChangeForm
                    .designationId ||
                  !jobChangeForm
                    .effectiveDate ||
                  !jobChangeForm
                    .reason
                    .trim()
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {jobChangeSaving
                ? "Recording Job Change..."
                : "Confirm Job Change"}
            </button>
          </div>
        </>
      )}
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
                            {employmentEpisodes.length} episode
              {employmentEpisodes.length === 1
                ? ""
                : "s"}
              {" \u2022 "}
              {lifecycleHistory.length} event
              {lifecycleHistory.length === 1
                ? ""
                : "s"}
            </div>
          </div>

                    <div
            style={
              episodeSectionStyle
            }
          >
            <div
              style={
                episodeSectionHeaderStyle
              }
            >
              <div>
                <div
                  style={
                    episodeSectionTitleStyle
                  }
                >
                  Employment Episodes
                </div>

                <div
                  style={
                    episodeSectionSubtitleStyle
                  }
                >
                  Distinct periods of service under this permanent employee identity.
                </div>
              </div>

              <span
                style={
                  episodeIdentityBadgeStyle
                }
              >
                Permanent ID: {profile.id}
              </span>
            </div>

            {episodesLoading ? (
              <div
                style={
                  episodeEmptyStyle
                }
              >
                Loading employment episodes...
              </div>
            ) : episodesError ? (
              <div
                style={
                  historyErrorStyle
                }
              >
                {episodesError}
              </div>
            ) : employmentEpisodes.length ===
              0 ? (
              <div
                style={
                  episodeEmptyStyle
                }
              >
                No employment episodes have been recorded for this employee yet.
              </div>
            ) : (
              <div
                style={
                  episodeGridStyle
                }
              >
                {employmentEpisodes.map(
                  (episode) => (
                    <EmploymentEpisode
                      key={
                        episode.id
                      }
                      episode={
                        episode
                      }
                    />
                  )
                )}
              </div>
            )}
          </div>

          <div
            style={
              lifecycleDividerStyle
            }
          >
            <span>
              Lifecycle Timeline
            </span>
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

function EmploymentEpisode({
  episode,
}) {
  const isCurrent =
    !episode.endDate;

  const startDepartment =
    episode.startDepartment?.name ||
    "Not Assigned";

  const startDesignation =
    episode.startDesignation?.name ||
    "Not Assigned";

  const startLocation =
    episode.startLocation?.name ||
    "Not Assigned";

  const endDepartment =
    episode.endDepartment?.name ||
    startDepartment;

  const endDesignation =
    episode.endDesignation?.name ||
    startDesignation;

  const endLocation =
    episode.endLocation?.name ||
    startLocation;

  const structureChanged =
    startDepartment !==
      endDepartment ||
    startDesignation !==
      endDesignation ||
    startLocation !==
      endLocation;

  return (
    <div
      style={{
        ...episodeCardStyle,

        border:
          isCurrent
            ? "1px solid rgba(8,122,67,0.30)"
            : "1px solid rgba(212,175,55,0.24)",

        boxShadow:
          isCurrent
            ? "0 10px 26px rgba(8,122,67,0.08)"
            : "0 8px 22px rgba(15,23,42,0.04)",
      }}
    >
      <div
        style={
          episodeTopRowStyle
        }
      >
        <div>
          <div
            style={
              episodeNumberStyle
            }
          >
            Episode {episode.sequenceNumber}
          </div>

          <div
            style={
              episodeDateRangeStyle
            }
          >
            {formatLongDate(
              episode.startDate
            )}
            {" \u2192 "}
            {isCurrent
              ? "Present"
              : formatLongDate(
                  episode.endDate
                )}
          </div>
        </div>

        <span
          style={{
            ...episodeStatusBadgeStyle,

            background:
              isCurrent
                ? "rgba(8,122,67,0.10)"
                : "rgba(212,175,55,0.12)",

            color:
              isCurrent
                ? "#087A43"
                : "#8A6B12",

            border:
              isCurrent
                ? "1px solid rgba(8,122,67,0.18)"
                : "1px solid rgba(212,175,55,0.24)",
          }}
        >
          {isCurrent
            ? "CURRENT"
            : "CLOSED"}
        </span>
      </div>

      <div
        style={
          episodeDetailsGridStyle
        }
      >
        <EpisodeDetail
          label="Started As"
          value={
            formatStatus(
              episode.startStatus
            )
          }
        />

        <EpisodeDetail
          label="Department"
          value={
            structureChanged
              ? `${startDepartment} â†’ ${endDepartment}`
              : startDepartment
          }
        />

        <EpisodeDetail
          label="Designation"
          value={
            structureChanged
              ? `${startDesignation} â†’ ${endDesignation}`
              : startDesignation
          }
        />

        <EpisodeDetail
          label="Location"
          value={
            structureChanged
              ? `${startLocation} â†’ ${endLocation}`
              : startLocation
          }
        />

        {episode.startReason && (
          <EpisodeDetail
            label="Start Reason"
            value={
              episode.startReason
            }
          />
        )}

        {!isCurrent &&
          episode.endStatus && (
          <EpisodeDetail
            label="Ended As"
            value={
              formatStatus(
                episode.endStatus
              )
            }
          />
        )}

        {!isCurrent &&
          episode.endReason && (
          <EpisodeDetail
            label="Exit Reason"
            value={
              episode.endReason
            }
          />
        )}

        {episode.notes && (
          <EpisodeDetail
            label="Episode Notes"
            value={
              episode.notes
            }
          />
        )}
      </div>
    </div>
  );
}


function EpisodeDetail({
  label,
  value,
}) {
  return (
    <div
      style={
        episodeDetailStyle
      }
    >
      <div
        style={
          episodeDetailLabelStyle
        }
      >
        {label}
      </div>

      <div
        style={
          episodeDetailValueStyle
        }
      >
        {value || "-"}
      </div>
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


  /*
  ============================================================
  SUSPENSION PERIOD
  ============================================================

  Suspension duration is calculated from the lifecycle
  effective date through the recorded suspension end date.

  The calculation is inclusive:
  14 Aug -> 14 Aug = 1 calendar day
  14 Aug -> 20 Aug = 7 calendar days
  ============================================================
  */

  let suspensionDurationDays =
    null;

  if (
    event.eventType ===
      "SUSPENDED" &&
    event.effectiveDate &&
    event.suspensionEndDate
  ) {
    const startDate =
      new Date(
        event.effectiveDate
      );

    const endDate =
      new Date(
        event.suspensionEndDate
      );

    const startUtc =
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate()
      );

    const endUtc =
      Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth(),
        endDate.getUTCDate()
      );

    suspensionDurationDays =
      Math.floor(
        (
          endUtc -
          startUtc
        ) /
          (
            1000 *
            60 *
            60 *
            24
          )
      ) + 1;
  }


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
            event.newStatus) &&
            event.previousStatus !==
              event.newStatus && (
              <HistoryDetail
                label="Status"
                value={`${formatStatus(
                  event.previousStatus
                )} → ${formatStatus(
                  event.newStatus
                )}`}
              />
            )}


          {event.eventType ===
            "SUSPENDED" &&
            event.suspensionEndDate && (
              <>
                <HistoryDetail
                  label="Suspension Period"
                  value={`${formatLongDate(
                    event.effectiveDate
                  )} → ${formatLongDate(
                    event.suspensionEndDate
                  )}`}
                />

                <HistoryDetail
                  label="Duration"
                  value={
                    suspensionDurationDays
                      ? `${suspensionDurationDays} calendar ${
                          suspensionDurationDays ===
                          1
                            ? "day"
                            : "days"
                        }`
                      : "-"
                  }
                />
              </>
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


          {(event.previousDepartment ||
            event.newDepartment) &&
            event.previousDepartment?.id !==
              event.newDepartment?.id && (
              <HistoryDetail
                label="Department"
                value={`${event.previousDepartment?.name ||
                  "Not Assigned"} → ${event.newDepartment?.name ||
                  "Not Assigned"}`}
              />
            )}


          {(event.previousDesignation ||
            event.newDesignation) &&
            event.previousDesignation?.id !==
              event.newDesignation?.id && (
              <HistoryDetail
                label="Designation"
                value={`${event.previousDesignation?.name ||
                  "Not Assigned"} → ${event.newDesignation?.name ||
                  "Not Assigned"}`}
              />
            )}


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
    JOB_CHANGED:
      "Job Changed",
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
  color: "#087A43",
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
  color: "#087A43",
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
  color: "#087A43",
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
  color: "#087A43",
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
  color: "#087A43",
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
  color: "#087A43",
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
  background: "#087A43",
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
    "#087A43",
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
    "#087A43",
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
    "#087A43",

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
    "#087A43",

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
const episodeSectionStyle = {
  marginBottom:
    "28px",

  padding:
    "20px",

  border:
    "1px solid rgba(8,122,67,0.14)",

  borderRadius:
    "15px",

  background:
    "linear-gradient(145deg, rgba(248,252,249,0.98), rgba(255,255,255,0.98))",
};

const episodeSectionHeaderStyle = {
  display:
    "flex",

  justifyContent:
    "space-between",

  alignItems:
    "flex-start",

  gap:
    "16px",

  flexWrap:
    "wrap",

  marginBottom:
    "16px",
};

const episodeSectionTitleStyle = {
  color:
    "#087A43",

  fontSize:
    "16px",

  fontWeight:
    "900",
};

const episodeSectionSubtitleStyle = {
  marginTop:
    "4px",

  color:
    "#64748B",

  fontSize:
    "12px",

  lineHeight:
    "1.5",
};

const episodeIdentityBadgeStyle = {
  padding:
    "6px 10px",

  borderRadius:
    "999px",

  background:
    "rgba(212,175,55,0.10)",

  border:
    "1px solid rgba(212,175,55,0.24)",

  color:
    "#72560C",

  fontSize:
    "10px",

  fontWeight:
    "900",
};

const episodeGridStyle = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(300px, 1fr))",

  gap:
    "14px",
};

const episodeCardStyle = {
  padding:
    "18px",

  borderRadius:
    "14px",

  background:
    "#FFFFFF",

  position:
    "relative",

  overflow:
    "hidden",
};

const episodeTopRowStyle = {
  display:
    "flex",

  justifyContent:
    "space-between",

  alignItems:
    "flex-start",

  gap:
    "12px",

  marginBottom:
    "14px",
};

const episodeNumberStyle = {
  color:
    "#172033",

  fontSize:
    "15px",

  fontWeight:
    "900",
};

const episodeDateRangeStyle = {
  marginTop:
    "4px",

  color:
    "#64748B",

  fontSize:
    "12px",

  fontWeight:
    "700",
};

const episodeStatusBadgeStyle = {
  padding:
    "5px 8px",

  borderRadius:
    "999px",

  fontSize:
    "9px",

  fontWeight:
    "900",

  letterSpacing:
    "0.05em",
};

const episodeDetailsGridStyle = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(180px, 1fr))",

  gap:
    "10px 16px",

  paddingTop:
    "12px",

  borderTop:
    "1px solid #E8EFEB",
};

const episodeDetailStyle = {
  minWidth:
    0,
};

const episodeDetailLabelStyle = {
  color:
    "#64748B",

  fontSize:
    "10px",

  fontWeight:
    "800",

  textTransform:
    "uppercase",

  letterSpacing:
    "0.04em",
};

const episodeDetailValueStyle = {
  marginTop:
    "3px",

  color:
    "#172033",

  fontSize:
    "12px",

  fontWeight:
    "800",

  lineHeight:
    "1.45",

  wordBreak:
    "break-word",
};

const episodeEmptyStyle = {
  padding:
    "20px",

  textAlign:
    "center",

  border:
    "1px dashed rgba(8,122,67,0.20)",

  borderRadius:
    "12px",

  color:
    "#64748B",

  fontSize:
    "12px",

  background:
    "rgba(248,252,249,0.80)",
};

const lifecycleDividerStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "12px",

  margin:
    "4px 0 18px",

  color:
    "#087A43",

  fontSize:
    "12px",

  fontWeight:
    "900",

  textTransform:
    "uppercase",

  letterSpacing:
    "0.05em",
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
  color: "#087A43",
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
  background: "#087A43",
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
  color: "#087A43",
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