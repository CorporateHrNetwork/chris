import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  apiRequest,
} from "../services/api";


function Designations() {
  const [
    departments,
    setDepartments,
  ] = useState([]);

  const [
    designations,
    setDesignations,
  ] = useState([]);

  const [
    selectedDepartmentId,
    setSelectedDepartmentId,
  ] = useState("");

  const [
    selectedMappingIds,
    setSelectedMappingIds,
  ] = useState([]);

  const [
    mapping,
    setMapping,
  ] = useState(false);

  const [
    careerTemplates,
    setCareerTemplates,
  ] = useState([]);

  const [
    selectedTemplateKey,
    setSelectedTemplateKey,
  ] = useState("");

  const [
    applyingTemplate,
    setApplyingTemplate,
  ] = useState(false);

  const [
    creatingRecommendedDepartment,
    setCreatingRecommendedDepartment,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    editingId,
    setEditingId,
  ] = useState("");

  const [
    savingId,
    setSavingId,
  ] = useState("");

  const [
    unmappingId,
    setUnmappingId,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const [
    showDepartmentForm,
    setShowDepartmentForm,
  ] = useState(false);

  const [
    showDesignationForm,
    setShowDesignationForm,
  ] = useState(false);

  const [
    departmentForm,
    setDepartmentForm,
  ] = useState({
    name: "",
    code: "",
    description: "",
  });

  const [
    designationForm,
    setDesignationForm,
  ] = useState({
    name: "",
    code: "",
    description: "",
  });

  const [
    careerForm,
    setCareerForm,
  ] = useState({
    careerTrack: "",
    careerLevel: "",
    reportsToDesignationId: "",

  });


  /*
  ============================================================
  LOAD ORGANIZATION STRUCTURE
  ============================================================
  */

  const loadData =
    async () => {
      try {
        setLoading(true);
        setError("");

        const [
          departmentResult,
          designationResult,
          templateResult,
        ] =
          await Promise.all([
            apiRequest(
              "/api/employees/career/departments"
            ),

            apiRequest(
              "/api/employees/career/catalog"
            ),

            apiRequest(
              "/api/employees/career/templates"
            ),
          ]);

        const nextDepartments =
          departmentResult.data ||
          [];

        setDepartments(
          nextDepartments
        );

        setDesignations(
          designationResult.data ||
          []
        );

        setCareerTemplates(
          templateResult.data ||
          []
        );

        setSelectedDepartmentId(
          (current) => {
            if (
              current &&
              nextDepartments.some(
                (department) =>
                  department.id ===
                    current &&
                  department.isActive !==
                    false
              )
            ) {
              return current;
            }

            return (
              nextDepartments.find(
                (department) =>
                  department.isActive !==
                  false
              )?.id ||
              ""
            );
          }
        );
      } catch (err) {
        console.error(
          "Organization structure load error:",
          err
        );

        setError(
          err.message ||
            "Unable to load organization structure."
        );
      } finally {
        setLoading(false);
      }
    };


  useEffect(() => {
    loadData();
  }, []);


  /*
  ============================================================
  AUTO-DISMISS SUCCESS MESSAGE
  ============================================================
  */

  useEffect(() => {
    if (
      !success
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          setSuccess("");
        },
        3500
      );

    return () =>
      window.clearTimeout(
        timer
      );
  }, [
    success,
  ]);


  /*
  ============================================================
  DERIVED DATA
  ============================================================
  */

  const selectedDepartment =
    useMemo(
      () =>
        departments.find(
          (department) =>
            department.id ===
            selectedDepartmentId
        ) ||
        null,
      [
        departments,
        selectedDepartmentId,
      ]
    );


  const recommendedTemplate =
    useMemo(
      () => {
        if (
          !selectedDepartment
        ) {
          return null;
        }

        const departmentName =
          String(
            selectedDepartment.name ||
              ""
          )
            .trim()
            .toLowerCase();

        const departmentCode =
          String(
            selectedDepartment.code ||
              ""
          )
            .trim()
            .toLowerCase();

        return (
          careerTemplates.find(
            (template) => {
              const templateNames =
                [
                  template.name,
                  template.code,
                  ...(template.aliases ||
                    []),
                ]
                  .filter(Boolean)
                  .map(
                    (value) =>
                      String(
                        value
                      )
                        .trim()
                        .toLowerCase()
                  );

              return (
                templateNames.includes(
                  departmentName
                ) ||
                (
                  departmentCode &&
                  templateNames.includes(
                    departmentCode
                  )
                )
              );
            }
          ) ||
          null
        );
      },
      [
        selectedDepartment,
        careerTemplates,
      ]
    );


  /*
  ============================================================
  DEPARTMENT-LOCKED CHRIS TEMPLATE
  ============================================================

  The professional CHRIS template for a department must always
  match that department.

  Example:
  Finance -> Finance template
  Audit -> Audit template

  Administrators can still customize the resulting positions,
  but cannot accidentally apply another department's template.
  ============================================================
  */

  const activeTemplate =
    recommendedTemplate;

  const recommendedDepartmentTemplates =
    useMemo(
      () => {
        const representedNames =
          new Set();

        departments.forEach(
          (department) => {
            const name =
              String(
                department.name ||
                  ""
              )
                .trim()
                .toLowerCase();

            const code =
              String(
                department.code ||
                  ""
              )
                .trim()
                .toLowerCase();

            if (
              name
            ) {
              representedNames.add(
                name
              );
            }

            if (
              code
            ) {
              representedNames.add(
                code
              );
            }
          }
        );


        return careerTemplates.filter(
          (template) => {
            const identifiers =
              [
                template.name,
                template.code,
                ...(template.aliases ||
                  []),
              ]
                .filter(Boolean)
                .map(
                  (value) =>
                    String(
                      value
                    )
                      .trim()
                      .toLowerCase()
                );


            return !identifiers.some(
              (identifier) =>
                representedNames.has(
                  identifier
                )
            );
          }
        );
      },
      [
        departments,
        careerTemplates,
      ]
    );

  const departmentDesignations =
    useMemo(
      () =>
        designations
          .filter(
            (designation) =>
              designation.departmentId ===
              selectedDepartmentId
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

              return a.name.localeCompare(
                b.name
              );
            }
          ),
      [
        designations,
        selectedDepartmentId,
      ]
    );


  const unmappedDesignations =
    useMemo(
      () =>
        designations
          .filter(
            (designation) =>
              !designation.departmentId
          )
          .sort(
            (a, b) =>
              a.name.localeCompare(
                b.name
              )
          ),
      [
        designations,
      ]
    );


  const careerTracks =
    useMemo(
      () =>
        Array.from(
          new Set(
            departmentDesignations
              .map(
                (designation) =>
                  designation.careerTrack
              )
              .filter(Boolean)
          )
        ).sort(),
      [
        departmentDesignations,
      ]
    );


  const configuredCount =
    departmentDesignations.filter(
      (designation) =>
        designation.careerTrack &&
        designation.careerLevel !=
          null
    ).length;


  /*
  ============================================================
  CREATE CHRIS RECOMMENDED DEPARTMENT
  ============================================================

  A CHRIS template remains generic.

  Selecting a recommended department copies it into the
  authenticated organization's own configuration and then
  applies its recommended career structure.
  ============================================================
  */

  const createRecommendedDepartment =
    async (
      templateKey
    ) => {
      const template =
        careerTemplates.find(
          (item) =>
            item.key ===
            templateKey
        );


      if (
        !template
      ) {
        setError(
          "The selected CHRIS department template could not be found."
        );

        return;
      }


      const confirmed =
        window.confirm(
          `Add ${template.name} to this organization?

CHRIS will create the department and apply its recommended career structure.

You can customize the department and its positions afterward.`
        );


      if (
        !confirmed
      ) {
        return;
      }


      try {
        setCreatingRecommendedDepartment(
          true
        );

        setError("");
        setSuccess("");


        /*
        --------------------------------------------------------
        CREATE TENANT DEPARTMENT
        --------------------------------------------------------
        */

        const departmentResult =
          await apiRequest(
            "/api/employees/career/departments",
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  name:
                    template.name,

                  code:
                    template.code ||
                    null,

                  description:
                    `Created from the CHRIS recommended ${template.name} structure.`,
                }),
            }
          );


        const newDepartmentId =
          departmentResult.data?.id;


        if (
          !newDepartmentId
        ) {
          throw new Error(
            "Department was created but CHRIS did not return its identifier."
          );
        }


        /*
        --------------------------------------------------------
        APPLY PROFESSIONAL CAREER STRUCTURE
        --------------------------------------------------------
        */

        const templateResult =
          await apiRequest(
            `/api/employees/career/templates/${encodeURIComponent(
              template.key
            )}/apply`,
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  departmentId:
                    newDepartmentId,
                }),
            }
          );


        await loadData();


        setSelectedDepartmentId(
          newDepartmentId
        );


        setSelectedTemplateKey(
          template.key
        );


        setSuccess(
          templateResult.message ||
            `${template.name} was added using the CHRIS recommended structure.`
        );
      } catch (err) {
        console.error(
          "Recommended department creation error:",
          err
        );


        setError(
          err.message ||
            "Unable to create the recommended department."
        );
      } finally {
        setCreatingRecommendedDepartment(
          false
        );
      }
    };

  /*
  ============================================================
  DEPARTMENT CHANGE
  ============================================================
  */

  const changeDepartment =
    (
      selectionValue
    ) => {
      if (
        String(
          selectionValue ||
            ""
        ).startsWith(
          "template:"
        )
      ) {
        const templateKey =
          String(
            selectionValue
          ).replace(
            "template:",
            ""
          );

        createRecommendedDepartment(
          templateKey
        );

        return;
      }


      setSelectedDepartmentId(
        selectionValue
      );

      setSelectedMappingIds(
        []
      );

      setSelectedTemplateKey(
        ""
      );

      setEditingId(
        ""
      );

      setShowDesignationForm(
        false
      );

      setError("");
      setSuccess("");
    };


  /*
  ============================================================
  MAPPING SELECTION
  ============================================================
  */

  const toggleMappingDesignation =
    (designationId) => {
      setSelectedMappingIds(
        (current) =>
          current.includes(
            designationId
          )
            ? current.filter(
                (id) =>
                  id !==
                  designationId
              )
            : [
                ...current,
                designationId,
              ]
      );
    };


  const selectAllUnmapped =
    () => {
      setSelectedMappingIds(
        unmappedDesignations.map(
          (designation) =>
            designation.id
        )
      );
    };


  const clearMappingSelection =
    () => {
      setSelectedMappingIds(
        []
      );

      setSelectedTemplateKey(
        ""
      );
    };


  /*
  ============================================================
  MAP EXISTING DESIGNATIONS
  ============================================================
  */

  const mapExistingDesignations =
    async () => {
      if (
        !selectedDepartmentId
      ) {
        setError(
          "Select a department first."
        );

        return;
      }


      if (
        selectedMappingIds.length ===
        0
      ) {
        setError(
          "Select at least one existing designation to map."
        );

        return;
      }


      try {
        setMapping(true);
        setError("");
        setSuccess("");

        const result =
          await apiRequest(
            "/api/employees/career/designations/map-department",
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  departmentId:
                    selectedDepartmentId,

                  designationIds:
                    selectedMappingIds,
                }),
            }
          );


        setSelectedMappingIds(
          []
        );


        setSuccess(
          result.message ||
            "Existing designations mapped successfully."
        );


        await loadData();
      } catch (err) {
        console.error(
          "Designation mapping error:",
          err
        );

        setError(
          err.message ||
            "Unable to map existing designations."
        );
      } finally {
        setMapping(false);
      }
    };


  /*
  ============================================================
  APPLY CHRIS RECOMMENDED TEMPLATE
  ============================================================
  */

  const applyCareerTemplate =
    async () => {
      if (
        !selectedDepartmentId
      ) {
        setError(
          "Select a department first."
        );

        return;
      }


      if (
        !activeTemplate
      ) {
        setError(
          "Select a CHRIS career template."
        );

        return;
      }


      const confirmed =
        window.confirm(
          `Apply the CHRIS recommended ${activeTemplate.name} career structure to ${selectedDepartment?.name || "this department"}?

Existing compatible designations will be reused and the recommended career levels/reporting chain will be applied.`
        );


      if (
        !confirmed
      ) {
        return;
      }


      try {
        setApplyingTemplate(
          true
        );

        setError("");
        setSuccess("");


        const result =
          await apiRequest(
            `/api/employees/career/templates/${encodeURIComponent(
              activeTemplate.key
            )}/apply`,
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  departmentId:
                    selectedDepartmentId,
                }),
            }
          );


        setSuccess(
          result.message ||
            "CHRIS recommended career structure applied."
        );


        await loadData();
      } catch (err) {
        console.error(
          "Career template application error:",
          err
        );

        setError(
          err.message ||
            "Unable to apply CHRIS career structure."
        );
      } finally {
        setApplyingTemplate(
          false
        );
      }
    };

  /*
  ============================================================
  CREATE DEPARTMENT
  ============================================================
  */

  const createDepartment =
    async (event) => {
      event.preventDefault();

      if (
        !departmentForm.name.trim()
      ) {
        setError(
          "Department name is required."
        );

        return;
      }

      try {
        setError("");
        setSuccess("");

        const result =
          await apiRequest(
            "/api/employees/career/departments",
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  name:
                    departmentForm.name.trim(),

                  code:
                    departmentForm.code.trim() ||
                    null,

                  description:
                    departmentForm.description.trim() ||
                    null,
                }),
            }
          );

        setDepartmentForm({
          name: "",
          code: "",
          description: "",
        });

        setShowDepartmentForm(
          false
        );

        setSuccess(
          result.message ||
            "Department created successfully."
        );

        await loadData();

        if (
          result.data?.id
        ) {
          setSelectedDepartmentId(
            result.data.id
          );
        }
      } catch (err) {
        setError(
          err.message ||
            "Unable to create department."
        );
      }
    };


  /*
  ============================================================
  CREATE DESIGNATION
  ============================================================
  */

  const createDesignation =
    async (event) => {
      event.preventDefault();

      if (
        !selectedDepartmentId
      ) {
        setError(
          "Select a department first."
        );

        return;
      }

      if (
        !designationForm.name.trim()
      ) {
        setError(
          "Designation name is required."
        );

        return;
      }

      try {
        setError("");
        setSuccess("");

        const result =
          await apiRequest(
            "/api/employees/career/designations",
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  departmentId:
                    selectedDepartmentId,

                  name:
                    designationForm.name.trim(),

                  code:
                    designationForm.code.trim() ||
                    null,

                  description:
                    designationForm.description.trim() ||
                    null,
                }),
            }
          );

        setDesignationForm({
          name: "",
          code: "",
          description: "",
        });

        setShowDesignationForm(
          false
        );

        setSuccess(
          result.message ||
            "Designation created successfully."
        );

        await loadData();
      } catch (err) {
        setError(
          err.message ||
            "Unable to create designation."
        );
      }
    };


  /*
  ============================================================
  CAREER CONFIGURATION
  ============================================================
  */

  const beginEdit =
    (designation) => {
      setEditingId(
        designation.id
      );

      setError("");
      setSuccess("");

      setCareerForm({
        careerTrack:
          designation.careerTrack ||
          "",

        careerLevel:
          designation.careerLevel !=
          null
            ? String(
                designation.careerLevel
              )
            : "",

        reportsToDesignationId:
          designation.reportsToDesignationId ||
          "",
});
    };


  const cancelEdit =
    () => {
      setEditingId("");

      setCareerForm({
        careerTrack: "",
        careerLevel: "",
        reportsToDesignationId: "",

      });
    };


  const saveCareer =
    async (
      event,
      designation
    ) => {
      event.preventDefault();

      const careerLevel =
        Number(
          careerForm.careerLevel
        );


      if (
        !careerForm.careerTrack.trim()
      ) {
        setError(
          "Career track is required."
        );

        return;
      }


      if (
        !Number.isInteger(
          careerLevel
        ) ||
        careerLevel < 1
      ) {
        setError(
          "Career level must be a whole number of 1 or above."
        );

        return;
      }


      try {
        setSavingId(
          designation.id
        );

        setError("");
        setSuccess("");

        const result =
          await apiRequest(
            `/api/employees/career/catalog/${encodeURIComponent(
              designation.id
            )}`,
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  departmentId:
                    selectedDepartmentId,

                  careerTrack:
                    careerForm.careerTrack.trim(),

                  careerLevel,

                  reportsToDesignationId:
                    careerForm.reportsToDesignationId ||
                    null,
}),
            }
          );

        setSuccess(
          result.message ||
            "Designation configuration saved."
        );

        setEditingId("");

        await loadData();
      } catch (err) {
        setError(
          err.message ||
            "Unable to save designation configuration."
        );
      } finally {
        setSavingId("");
      }
    };


  /*
  ============================================================
  CONTROLLED UNMAP DESIGNATION
  ============================================================
  */

  const unmapDesignation =
    async (
      designation
    ) => {
      if (
        !designation?.id
      ) {
        return;
      }


      const departmentName =
        designation.department?.name ||
        selectedDepartment?.name ||
        "the current department";


      const confirmed =
        window.confirm(
          `Unmap ${designation.name} from ${departmentName}?

The designation will NOT be deleted or deactivated.

CHRIS will preserve its code, career track, career level and history.

Unmapping will be blocked if current employees or reporting positions still depend on this designation.`
        );


      if (
        !confirmed
      ) {
        return;
      }


      try {
        setUnmappingId(
          designation.id
        );

        setError("");
        setSuccess("");


        const result =
          await apiRequest(
            `/api/employees/career/designations/${encodeURIComponent(
              designation.id
            )}/unmap`,
            {
              method:
                "PATCH",
            }
          );


        setSuccess(
          result.message ||
            "Designation unmapped successfully."
        );


        if (
          editingId ===
          designation.id
        ) {
          setEditingId(
            ""
          );
        }


        await loadData();
      } catch (err) {
        console.error(
          "Designation unmap error:",
          err
        );


        setError(
          err.message ||
            "Unable to unmap the designation."
        );
      } finally {
        setUnmappingId(
          ""
        );
      }
    };

  /*
  ============================================================
  REPORTING OPTIONS
  ============================================================
  */

  const reportingOptions =
    (designation) =>
      departmentDesignations.filter(
        (candidate) =>
          candidate.id !==
            designation.id &&
          candidate.isActive !==
            false
      );


  /*
  ============================================================
  RENDER
  ============================================================
  */

  if (
    loading
  ) {
    return (
      <div
        style={
          pageStyle
        }
      >
        <div
          style={
            cardStyle
          }
        >
          Loading Organization Structure...
        </div>
      </div>
    );
  }


  return (
    <div
      style={
        pageStyle
      }
    >
      <div
        style={
          headerStyle
        }
      >
        <div>
          <p
            style={
              eyebrowStyle
            }
          >
            Organization Configuration
          </p>

          <h1
            style={
              titleStyle
            }
          >
            Departments & Designations
          </h1>

          <p
            style={
              subtitleStyle
            }
          >
            Build each department, assign its designations and
            configure the career hierarchy used by CHRIS.
            All records belong only to the signed-in organization.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setShowDepartmentForm(
              true
            )
          }
          style={
            primaryButtonStyle
          }
        >
          + Add Department
        </button>
      </div>


      {error && (
        <div
          style={
            errorStyle
          }
        >
          {error}
        </div>
      )}


      {success && (
        <div
          style={
            successStyle
          }
        >
          {success}
        </div>
      )}


      {showDepartmentForm && (
        <section
          style={
            cardStyle
          }
        >
          <h2
            style={
              sectionTitleStyle
            }
          >
            Add Department
          </h2>

          <form
            onSubmit={
              createDepartment
            }
            style={
              formGridStyle
            }
          >
            <Field
              label="Department Name"
            >
              <input
                value={
                  departmentForm.name
                }
                onChange={(
                  event
                ) =>
                  setDepartmentForm(
                    (current) => ({
                      ...current,
                      name:
                        event.target.value,
                    })
                  )
                }
                style={
                  inputStyle
                }
                placeholder="e.g. Human Resources"
              />
            </Field>

            <Field
              label="Code"
            >
              <input
                value={
                  departmentForm.code
                }
                onChange={(
                  event
                ) =>
                  setDepartmentForm(
                    (current) => ({
                      ...current,
                      code:
                        event.target.value,
                    })
                  )
                }
                style={
                  inputStyle
                }
                placeholder="e.g. HR"
              />
            </Field>

            <Field
              label="Description"
            >
              <input
                value={
                  departmentForm.description
                }
                onChange={(
                  event
                ) =>
                  setDepartmentForm(
                    (current) => ({
                      ...current,
                      description:
                        event.target.value,
                    })
                  )
                }
                style={
                  inputStyle
                }
                placeholder="Optional"
              />
            </Field>

            <div
              style={
                buttonRowStyle
              }
            >
              <button
                type="submit"
                style={
                  primaryButtonStyle
                }
              >
                Save Department
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowDepartmentForm(
                    false
                  )
                }
                style={
                  secondaryButtonStyle
                }
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}


      <section
        style={
          cardStyle
        }
      >
        <div
          style={
            departmentToolbarStyle
          }
        >
          <div
            style={{
              flex:
                1,
            }}
          >
            <label
              style={
                labelStyle
              }
            >
              Department
            </label>

            <select
              value={
                selectedDepartmentId
              }
              disabled={
                creatingRecommendedDepartment
              }
              onChange={(
                event
              ) =>
                changeDepartment(
                  event.target.value
                )
              }
              style={
                selectStyle
              }
            >
              <option value="">
                Select Department
              </option>

              <optgroup
                label="My Organization"
              >
                {departments
                  .filter(
                    (department) =>
                      department.isActive !==
                      false
                  )
                  .map(
                    (
                      department
                    ) => (
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
                        {department.code
                          ? ` (${department.code})`
                          : ""}
                      </option>
                    )
                  )}
              </optgroup>

              {recommendedDepartmentTemplates.length >
                0 && (
                <optgroup
                  label="CHRIS Recommended Departments"
                >
                  {recommendedDepartmentTemplates.map(
                    (
                      template
                    ) => (
                      <option
                        key={`template-${template.key}`}
                        value={`template:${template.key}`}
                      >
                        {
                          template.name
                        }
                        {template.code
                          ? ` (${template.code})`
                          : ""}
                      </option>
                    )
                  )}
                </optgroup>
              )}
            </select>
          </div>

          {creatingRecommendedDepartment && (
            <div
              style={
                recommendedDepartmentCreatingStyle
              }
            >
              <strong>
                Creating Department...
              </strong>

              <span>
                CHRIS is applying the recommended career structure.
              </span>
            </div>
          )}

          {selectedDepartment && (
            <div
              style={
                selectedDepartmentStyle
              }
            >
              <strong>
                {
                  selectedDepartment.name
                }
              </strong>

              <span>
                {
                  selectedDepartment
                    ._count
                    ?.designations ||
                  0
                }{" "}
                designation(s)
              </span>
            </div>
          )}
        </div>
      </section>


      {selectedDepartmentId && (
        <section
          style={
            templateCardStyle
          }
        >
          <div
            style={
              sectionHeaderStyle
            }
          >
            <div>
              <p
                style={
                  templateEyebrowStyle
                }
              >
                CHRIS Professional Guidance
              </p>

              <h2
                style={
                  sectionTitleStyle
                }
              >
                Recommended Career Structure
              </h2>

              <p
                style={
                  sectionDescriptionStyle
                }
              >
                Use a professionally structured starter hierarchy
                or continue building this department manually.
              </p>
            </div>
          </div>


          <div
            style={
              templateSelectorGridStyle
            }
          >
            <div>
              <label
                style={
                  labelStyle
                }
              >
                Career Structure Template
              </label>

              <select
                value={
                  recommendedTemplate?.key ||
                  ""
                }
                disabled
                onChange={(
                  event
                ) =>
                  setSelectedTemplateKey(
                    event.target.value
                  )
                }
                style={
                  selectStyle
                }
              >
                <option value="">
                  Select CHRIS Template
                </option>

                {careerTemplates.map(
                  (
                    template
                  ) => (
                    <option
                      key={
                        template.key
                      }
                      value={
                        template.key
                      }
                    >
                      {
                        template.name
                      }
                      {recommendedTemplate?.key ===
                      template.key
                        ? " - Recommended" : ""}
                    </option>
                  )
                )}
              </select>
            </div>


            {activeTemplate && (
              <div
                style={
                  templateSummaryStyle
                }
              >
                <strong>
                  {
                    activeTemplate.name
                  }
                </strong>

                <span>
                  Career Track:{" "}
                  {
                    activeTemplate.careerTrack
                  }
                </span>

                <span>
                  {
                    activeTemplate.positions
                      ?.length ||
                    0
                  }{" "}
                  recommended level(s)
                </span>
              </div>
            )}
          </div>


          {activeTemplate && (
            <>
              <div
                style={
                  templatePositionGridStyle
                }
              >
                {activeTemplate.positions.map(
                  (
                    position
                  ) => (
                    <div
                      key={`${activeTemplate.key}-${position.level}`}
                      style={
                        templatePositionStyle
                      }
                    >
                      <span
                        style={
                          templateLevelStyle
                        }
                      >
                        Level{" "}
                        {
                          position.level
                        }
                      </span>

                      <strong>
                        {
                          position.name
                        }
                      </strong>

                      <span>
                        {
                          position.code ||
                          "-"
                        }
                      </span>

                      <small>
                        Reports To:{" "}
                        {
                          position.reportsTo || "-"
                        }
                      </small>
                    </div>
                  )
                )}
              </div>


              <div
                style={
                  templateActionStyle
                }
              >
                <div>
                  <strong>
                    CHRIS Recommended
                  </strong>

                  <p
                    style={
                      templateHelpStyle
                    }
                  >
                    Applying this template creates or reuses the
                    recommended positions inside this organization.
                    You can customize them afterward.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    applyingTemplate
                  }
                  onClick={
                    applyCareerTemplate
                  }
                  style={{
                    ...primaryButtonStyle,

                    opacity:
                      applyingTemplate
                        ? 0.6
                        : 1,
                  }}
                >
                  {applyingTemplate
                    ? "Applying..."
                    : "Apply Recommended Structure"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {unmappedDesignations.length >
        0 && (
        <section
          style={
            mappingCardStyle
          }
        >
          <div
            style={
              sectionHeaderStyle
            }
          >
            <div>
              <h2
                style={
                  sectionTitleStyle
                }
              >
                Map Existing Designations
              </h2>

              <p
                style={
                  sectionDescriptionStyle
                }
              >
                {
                  unmappedDesignations.length
                }{" "}
                existing designation(s)
                are not yet attached to
                a department. Select the
                positions that should be
                assigned to{" "}
                <strong>
                  {
                    selectedDepartment
                      ?.name ||
                    "the selected department"
                  }
                </strong>
                .
              </p>

              <p
                style={
                  mappingExplanationStyle
                }
              >
                The checkbox only selects a designation for department
                assignment. Its existing Active / Inactive status is
                preserved automatically by CHRIS.
              </p>
            </div>

            <div
              style={
                buttonRowStyle
              }
            >
              <button
                type="button"
                onClick={
                  selectAllUnmapped
                }
                style={
                  secondaryButtonStyle
                }
              >
                Select All Unmapped
              </button>

              <button
                type="button"
                onClick={
                  clearMappingSelection
                }
                style={
                  secondaryButtonStyle
                }
              >
                Clear
              </button>
            </div>
          </div>


          <div
            style={
              mappingGridStyle
            }
          >
            {unmappedDesignations.map(
              (
                designation
              ) => {
                const checked =
                  selectedMappingIds.includes(
                    designation.id
                  );

                return (
                  <label
                    key={
                      designation.id
                    }
                    style={{
                      ...mappingItemStyle,

                      borderColor:
                        checked
                          ? "#0B5E3B"
                          : "#E2E8F0",

                      background:
                        checked
                          ? "#F0FDF4"
                          : "#FFFFFF",
                    }}
                  >
                    <div
                      style={
                        mappingSelectionControlStyle
                      }
                    >
                      <input
                        type="checkbox"
                        checked={
                          checked
                        }
                        onChange={() =>
                          toggleMappingDesignation(
                            designation.id
                          )
                        }
                      />

                      <span>
                        Assign
                      </span>
                    </div>

                    <div
                      style={{
                        flex:
                          1,
                      }}
                    >
                      <div
                        style={
                          mappingTitleRowStyle
                        }
                      >
                        <strong
                          style={
                            mappingNameStyle
                          }
                        >
                          {
                            designation.name
                          }
                        </strong>

                        <span
                          style={
                            designation.isActive !==
                            false
                              ? mappingActiveBadgeStyle
                              : mappingInactiveBadgeStyle
                          }
                        >
                          {designation.isActive !==
                          false
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </div>

                      <div
                        style={
                          mappingMetaStyle
                        }
                      >
                        <span>
                          Code:{" "}
                          {
                            designation.code ||
                            "-"
                          }
                        </span>

                        <span>
                          Track:{" "}
                          {
                            designation.careerTrack ||
                            "Not Configured"
                          }
                        </span>

                        <span>
                          Level:{" "}
                          {designation.careerLevel !=
                          null
                            ? designation.careerLevel
                            : "-"}
                        </span>

                        <span>
                          Reports To:{" "}
                          {
                            designation
                              .reportsToDesignation
                              ?.name ||
                            "-"
                          }
                        </span>
                      </div>
                    </div>
                  </label>
                );
              }
            )}
          </div>


          <div
            style={
              mappingFooterStyle
            }
          >
            <span
              style={
                mappingSelectionStyle
              }
            >
              {
                selectedMappingIds.length
              }{" "}
              selected
            </span>

            <button
              type="button"
              disabled={
                mapping ||
                selectedMappingIds.length ===
                  0 ||
                !selectedDepartmentId
              }
              onClick={
                mapExistingDesignations
              }
              style={{
                ...primaryButtonStyle,

                opacity:
                  mapping ||
                  selectedMappingIds.length ===
                    0 ||
                  !selectedDepartmentId
                    ? 0.55
                    : 1,
              }}
            >
              {mapping
                ? "Mapping..."
                : `Map to ${
                    selectedDepartment
                      ?.name ||
                    "Department"
                  }`}
            </button>
          </div>
        </section>
      )}


      {selectedDepartmentId && (
        <>
          <div
            style={
              summaryGridStyle
            }
          >
            <SummaryCard
              label="Department Designations"
              value={
                departmentDesignations.length
              }
            />

            <SummaryCard
              label="Career Tracks"
              value={
                careerTracks.length
              }
            />

            <SummaryCard
              label="Configured"
              value={
                configuredCount
              }
            />

            <SummaryCard
              label="Pending"
              value={
                departmentDesignations.length -
                configuredCount
              }
            />
          </div>


          <section
            style={
              cardStyle
            }
          >
            <div
              style={
                sectionHeaderStyle
              }
            >
              <div>
                <h2
                  style={
                    sectionTitleStyle
                  }
                >
                  {
                    selectedDepartment
                      ?.name
                  }{" "}
                  Designations
                </h2>

                <p
                  style={
                    sectionDescriptionStyle
                  }
                >
                  Only positions belonging
                  to the selected department
                  appear here.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowDesignationForm(
                    true
                  )
                }
                style={
                  primaryButtonStyle
                }
              >
                + Add Designation
              </button>
            </div>


            {showDesignationForm && (
              <form
                onSubmit={
                  createDesignation
                }
                style={
                  addDesignationStyle
                }
              >
                <Field
                  label="Designation Name"
                >
                  <input
                    value={
                      designationForm.name
                    }
                    onChange={(
                      event
                    ) =>
                      setDesignationForm(
                        (current) => ({
                          ...current,
                          name:
                            event.target.value,
                        })
                      )
                    }
                    style={
                      inputStyle
                    }
                    placeholder="e.g. HR Officer"
                  />
                </Field>

                <Field
                  label="Code"
                >
                  <input
                    value={
                      designationForm.code
                    }
                    onChange={(
                      event
                    ) =>
                      setDesignationForm(
                        (current) => ({
                          ...current,
                          code:
                            event.target.value,
                        })
                      )
                    }
                    style={
                      inputStyle
                    }
                    placeholder="Optional"
                  />
                </Field>

                <Field
                  label="Description"
                >
                  <input
                    value={
                      designationForm.description
                    }
                    onChange={(
                      event
                    ) =>
                      setDesignationForm(
                        (current) => ({
                          ...current,
                          description:
                            event.target.value,
                        })
                      )
                    }
                    style={
                      inputStyle
                    }
                    placeholder="Optional"
                  />
                </Field>

                <div
                  style={
                    buttonRowStyle
                  }
                >
                  <button
                    type="submit"
                    style={
                      primaryButtonStyle
                    }
                  >
                    Save Designation
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setShowDesignationForm(
                        false
                      )
                    }
                    style={
                      secondaryButtonStyle
                    }
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}


            {departmentDesignations.length ===
            0 ? (
              <div
                style={
                  emptyStyle
                }
              >
                No designations have been
                assigned to this department
                yet.
              </div>
            ) : (
              <div
                style={
                  tableWrapperStyle
                }
              >
                <table
                  style={
                    tableStyle
                  }
                >
                  <thead>
                    <tr>
                      <TableHead>
                        Designation
                      </TableHead>

                      <TableHead>
                        Code
                      </TableHead>

                      <TableHead>
                        Career Track
                      </TableHead>

                      <TableHead>
                        Level
                      </TableHead>

                      <TableHead>
                        Reports To
                      </TableHead>

                      <TableHead>
                        Status
                      </TableHead>

                      <TableHead>
                        Action
                      </TableHead>
                    </tr>
                  </thead>

                  <tbody>
                    {departmentDesignations.map(
                      (
                        designation
                      ) => {
                        const isEditing =
                          editingId ===
                          designation.id;

                        return (
                          <tr
                            key={
                              designation.id
                            }
                            style={
                              rowStyle
                            }
                          >
                            <td
                              style={
                                cellStyle
                              }
                            >
                              <strong>
                                {
                                  designation.name
                                }
                              </strong>
                            </td>

                            <td
                              style={
                                cellStyle
                              }
                            >
                              {
                                designation.code ||
                                "-"
                              }
                            </td>

                            <td
                              style={
                                cellStyle
                              }
                            >
                              {isEditing ? (
                                <input
                                  value={
                                    careerForm.careerTrack
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setCareerForm(
                                      (
                                        current
                                      ) => ({
                                        ...current,

                                        careerTrack:
                                          event.target.value,
                                      })
                                    )
                                  }
                                  list="department-career-tracks"
                                  style={
                                    inputStyle
                                  }
                                  placeholder="e.g. Human Resources"
                                />
                              ) : (
                                designation.careerTrack ||
                                "Not Configured"
                              )}

                              <datalist
                                id="department-career-tracks"
                              >
                                {careerTracks.map(
                                  (
                                    track
                                  ) => (
                                    <option
                                      key={
                                        track
                                      }
                                      value={
                                        track
                                      }
                                    />
                                  )
                                )}
                              </datalist>
                            </td>

                            <td
                              style={
                                cellStyle
                              }
                            >
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={
                                    careerForm.careerLevel
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setCareerForm(
                                      (
                                        current
                                      ) => ({
                                        ...current,

                                        careerLevel:
                                          event.target.value,
                                      })
                                    )
                                  }
                                  style={{
                                    ...inputStyle,

                                    width:
                                      "85px",
                                  }}
                                />
                              ) : designation.careerLevel !=
                                null ? (
                                `Level ${designation.careerLevel}`
                              ) : (
                                "-"
                              )}
                            </td>

                            <td
                              style={
                                cellStyle
                              }
                            >
                              {isEditing ? (
                                <select
                                  value={
                                    careerForm.reportsToDesignationId
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setCareerForm(
                                      (
                                        current
                                      ) => ({
                                        ...current,

                                        reportsToDesignationId:
                                          event.target.value,
                                      })
                                    )
                                  }
                                  style={
                                    inputStyle
                                  }
                                >
                                  <option value="">
                                    No Reporting Position
                                  </option>

                                  {reportingOptions(
                                    designation
                                  ).map(
                                    (
                                      candidate
                                    ) => (
                                      <option
                                        key={
                                          candidate.id
                                        }
                                        value={
                                          candidate.id
                                        }
                                      >
                                        {
                                          candidate.name
                                        }
                                        {candidate.careerLevel !=
                                        null
                                          ? ` - Level ${candidate.careerLevel}`
                                          : ""}
                                      </option>
                                    )
                                  )}
                                </select>
                              ) : (
                                designation
                                  .reportsToDesignation
                                  ?.name ||
                                "-"
                              )}
                            </td>

                            <td
                              style={
                                cellStyle
                              }
                            >
                              {
                                      designation.isActive !==
                                      false
                                        ? "Active"
                                        : "Inactive"
                                    }
                            </td>

                            <td
                              style={
                                cellStyle
                              }
                            >
                              {isEditing ? (
                                <form
                                  onSubmit={(
                                    event
                                  ) =>
                                    saveCareer(
                                      event,
                                      designation
                                    )
                                  }
                                  style={
                                    buttonRowStyle
                                  }
                                >
                                  <button
                                    type="submit"
                                    disabled={
                                      savingId ===
                                      designation.id
                                    }
                                    style={
                                      primaryButtonStyle
                                    }
                                  >
                                    {savingId ===
                                    designation.id
                                      ? "Saving..."
                                      : "Save"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={
                                      cancelEdit
                                    }
                                    style={
                                      secondaryButtonStyle
                                    }
                                  >
                                    Cancel
                                  </button>
                                </form>
                              ) : (
                                <div
                                  style={
                                    designationActionStyle
                                  }
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      beginEdit(
                                        designation
                                      )
                                    }
                                    disabled={
                                      unmappingId ===
                                      designation.id
                                    }
                                    style={
                                      secondaryButtonStyle
                                    }
                                  >
                                    Configure
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      unmapDesignation(
                                        designation
                                      )
                                    }
                                    disabled={
                                      unmappingId ===
                                      designation.id
                                    }
                                    style={{
                                      ...unmapButtonStyle,

                                      opacity:
                                        unmappingId ===
                                        designation.id
                                          ? 0.55
                                          : 1,
                                    }}
                                  >
                                    {unmappingId ===
                                    designation.id
                                      ? "Unmapping..."
                                      : "Unmap"}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}


function Field({
  label,
  children,
}) {
  return (
    <label>
      <span
        style={
          labelStyle
        }
      >
        {label}
      </span>

      {children}
    </label>
  );
}


function SummaryCard({
  label,
  value,
}) {
  return (
    <div
      style={
        summaryCardStyle
      }
    >
      <div
        style={
          summaryValueStyle
        }
      >
        {value}
      </div>

      <div
        style={
          summaryLabelStyle
        }
      >
        {label}
      </div>
    </div>
  );
}


function TableHead({
  children,
}) {
  return (
    <th
      style={
        tableHeadStyle
      }
    >
      {children}
    </th>
  );
}


/*
============================================================
STYLES
============================================================
*/

const pageStyle = {
  padding:
    "26px",

  background:
    "#F8FAFC",

  minHeight:
    "100%",
};

const headerStyle = {
  display:
    "flex",

  alignItems:
    "flex-start",

  justifyContent:
    "space-between",

  gap:
    "20px",

  marginBottom:
    "20px",
};

const eyebrowStyle = {
  margin:
    "0 0 5px",

  color:
    "#0B5E3B",

  fontSize:
    "11px",

  fontWeight:
    "900",

  textTransform:
    "uppercase",

  letterSpacing:
    ".08em",
};

const titleStyle = {
  margin:
    0,

  color:
    "#0F172A",

  fontSize:
    "28px",

  fontWeight:
    "850",
};

const subtitleStyle = {
  maxWidth:
    "760px",

  margin:
    "8px 0 0",

  color:
    "#64748B",

  fontSize:
    "13px",

  lineHeight:
    "1.6",
};

const cardStyle = {
  marginBottom:
    "18px",

  padding:
    "20px",

  background:
    "#FFFFFF",

  border:
    "1px solid #E2E8F0",

  borderRadius:
    "14px",
};

const mappingCardStyle = {
  ...cardStyle,

  border:
    "1px solid #F6D98B",

  background:
    "#FFFCF3",
};

const departmentToolbarStyle = {
  display:
    "flex",

  alignItems:
    "end",

  justifyContent:
    "space-between",

  gap:
    "20px",
};

const selectedDepartmentStyle = {
  minWidth:
    "190px",

  display:
    "flex",

  flexDirection:
    "column",

  gap:
    "4px",

  padding:
    "11px 14px",

  border:
    "1px solid #DDE8E2",

  borderRadius:
    "9px",

  color:
    "#0B5E3B",

  fontSize:
    "12px",
};

const mappingGridStyle = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(280px, 1fr))",

  gap:
    "10px",
};

const mappingItemStyle = {
  display:
    "flex",

  alignItems:
    "flex-start",

  gap:
    "10px",

  padding:
    "13px",

  border:
    "1px solid #E2E8F0",

  borderRadius:
    "10px",

  cursor:
    "pointer",
};

const mappingNameStyle = {
  color:
    "#0F172A",

  fontSize:
    "12px",
};

const mappingMetaStyle = {
  display:
    "flex",

  flexWrap:
    "wrap",

  gap:
    "5px 12px",

  marginTop:
    "6px",

  color:
    "#64748B",

  fontSize:
    "10px",
};

const mappingFooterStyle = {
  display:
    "flex",

  alignItems:
    "center",

  justifyContent:
    "space-between",

  gap:
    "12px",

  marginTop:
    "15px",
};

const mappingSelectionStyle = {
  color:
    "#475569",

  fontSize:
    "11px",

  fontWeight:
    "800",
};

const formGridStyle = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(180px, 1fr))",

  gap:
    "14px",

  alignItems:
    "end",
};

const addDesignationStyle = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(180px, 1fr))",

  gap:
    "12px",

  alignItems:
    "end",

  marginBottom:
    "18px",

  padding:
    "16px",

  border:
    "1px solid #DDE8E2",

  borderRadius:
    "10px",

  background:
    "#FAFCFB",
};

const labelStyle = {
  display:
    "block",

  marginBottom:
    "6px",

  color:
    "#475569",

  fontSize:
    "11px",

  fontWeight:
    "800",
};

const inputStyle = {
  width:
    "100%",

  boxSizing:
    "border-box",

  padding:
    "9px 10px",

  border:
    "1px solid #CBD5E1",

  borderRadius:
    "7px",

  background:
    "#FFFFFF",

  color:
    "#0F172A",

  fontFamily:
    "inherit",

  fontSize:
    "12px",
};

const selectStyle = {
  ...inputStyle,

  minWidth:
    "280px",
};

const buttonRowStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "8px",

  flexWrap:
    "wrap",
};

const primaryButtonStyle = {
  padding:
    "9px 13px",

  border:
    "1px solid #0B5E3B",

  borderRadius:
    "7px",

  background:
    "#0B5E3B",

  color:
    "#FFFFFF",

  fontFamily:
    "inherit",

  fontSize:
    "11px",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

const secondaryButtonStyle = {
  padding:
    "8px 12px",

  border:
    "1px solid #CBD5E1",

  borderRadius:
    "7px",

  background:
    "#FFFFFF",

  color:
    "#475569",

  fontFamily:
    "inherit",

  fontSize:
    "11px",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

const sectionHeaderStyle = {
  display:
    "flex",

  alignItems:
    "center",

  justifyContent:
    "space-between",

  gap:
    "15px",

  marginBottom:
    "16px",
};

const sectionTitleStyle = {
  margin:
    0,

  color:
    "#0F172A",

  fontSize:
    "17px",

  fontWeight:
    "850",
};

const sectionDescriptionStyle = {
  margin:
    "5px 0 0",

  color:
    "#64748B",

  fontSize:
    "12px",
};

const summaryGridStyle = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(160px, 1fr))",

  gap:
    "12px",

  marginBottom:
    "18px",
};

const summaryCardStyle = {
  padding:
    "16px",

  border:
    "1px solid #E2E8F0",

  borderRadius:
    "12px",

  background:
    "#FFFFFF",
};

const summaryValueStyle = {
  color:
    "#0B5E3B",

  fontSize:
    "24px",

  fontWeight:
    "900",
};

const summaryLabelStyle = {
  marginTop:
    "4px",

  color:
    "#64748B",

  fontSize:
    "10px",

  fontWeight:
    "850",

  textTransform:
    "uppercase",
};

const successStyle = {
  marginBottom:
    "16px",

  padding:
    "12px 14px",

  border:
    "1px solid #BBF7D0",

  borderRadius:
    "9px",

  background:
    "#F0FDF4",

  color:
    "#166534",

  fontSize:
    "12px",

  fontWeight:
    "700",
};

const errorStyle = {
  marginBottom:
    "16px",

  padding:
    "12px 14px",

  border:
    "1px solid #FECACA",

  borderRadius:
    "9px",

  background:
    "#FEF2F2",

  color:
    "#B91C1C",

  fontSize:
    "12px",

  fontWeight:
    "700",
};

const tableWrapperStyle = {
  overflowX:
    "auto",
};

const tableStyle = {
  width:
    "100%",

  minWidth:
    "980px",

  borderCollapse:
    "collapse",
};

const tableHeadStyle = {
  padding:
    "10px",

  borderBottom:
    "1px solid #CBD5E1",

  color:
    "#64748B",

  textAlign:
    "left",

  fontSize:
    "10px",

  fontWeight:
    "900",

  textTransform:
    "uppercase",
};

const rowStyle = {
  borderBottom:
    "1px solid #EEF2F7",
};

const cellStyle = {
  padding:
    "11px 10px",

  color:
    "#334155",

  fontSize:
    "12px",

  verticalAlign:
    "middle",
};

const checkboxStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "6px",
};

const emptyStyle = {
  padding:
    "25px",

  border:
    "1px dashed #CBD5E1",

  borderRadius:
    "10px",

  color:
    "#64748B",

  textAlign:
    "center",

  fontSize:
    "12px",
};


const templateCardStyle = {
  ...cardStyle,

  border:
    "1px solid #D9C26A",

  background:
    "#FFFDF5",
};

const templateEyebrowStyle = {
  margin:
    "0 0 5px",

  color:
    "#9A6B00",

  fontSize:
    "10px",

  fontWeight:
    "900",

  textTransform:
    "uppercase",

  letterSpacing:
    ".08em",
};

const templateSelectorGridStyle = {
  display:
    "grid",

  gridTemplateColumns:
    "minmax(260px, 1fr) minmax(200px, 320px)",

  gap:
    "14px",

  alignItems:
    "end",

  marginBottom:
    "16px",
};

const templateSummaryStyle = {
  display:
    "flex",

  flexDirection:
    "column",

  gap:
    "4px",

  padding:
    "11px 13px",

  border:
    "1px solid #E8D98F",

  borderRadius:
    "9px",

  background:
    "#FFFFFF",

  color:
    "#475569",

  fontSize:
    "11px",
};

const templatePositionGridStyle = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(190px, 1fr))",

  gap:
    "10px",

  marginTop:
    "10px",
};

const templatePositionStyle = {
  display:
    "flex",

  flexDirection:
    "column",

  gap:
    "5px",

  padding:
    "12px",

  border:
    "1px solid #E8E2C5",

  borderRadius:
    "9px",

  background:
    "#FFFFFF",

  color:
    "#334155",

  fontSize:
    "11px",
};

const templateLevelStyle = {
  color:
    "#0B5E3B",

  fontSize:
    "10px",

  fontWeight:
    "900",

  textTransform:
    "uppercase",
};

const templateActionStyle = {
  display:
    "flex",

  alignItems:
    "center",

  justifyContent:
    "space-between",

  gap:
    "15px",

  marginTop:
    "16px",

  paddingTop:
    "15px",

  borderTop:
    "1px solid #E8E2C5",
};

const templateHelpStyle = {
  margin:
    "4px 0 0",

  maxWidth:
    "700px",

  color:
    "#64748B",

  fontSize:
    "11px",

  lineHeight:
    "1.5",
};

const mappingExplanationStyle = {
  margin:
    "7px 0 0",

  color:
    "#64748B",

  fontSize:
    "10px",

  lineHeight:
    "1.5",
};

const mappingSelectionControlStyle = {
  minWidth:
    "58px",

  display:
    "flex",

  alignItems:
    "center",

  gap:
    "5px",

  color:
    "#475569",

  fontSize:
    "9px",

  fontWeight:
    "800",

  textTransform:
    "uppercase",

  letterSpacing:
    ".03em",
};

const mappingTitleRowStyle = {
  display:
    "flex",

  alignItems:
    "center",

  justifyContent:
    "space-between",

  gap:
    "10px",
};

const mappingActiveBadgeStyle = {
  display:
    "inline-flex",

  alignItems:
    "center",

  justifyContent:
    "center",

  padding:
    "3px 7px",

  borderRadius:
    "999px",

  background:
    "#DCFCE7",

  color:
    "#166534",

  fontSize:
    "9px",

  fontWeight:
    "900",

  textTransform:
    "uppercase",
};

const mappingInactiveBadgeStyle = {
  display:
    "inline-flex",

  alignItems:
    "center",

  justifyContent:
    "center",

  padding:
    "3px 7px",

  borderRadius:
    "999px",

  background:
    "#F1F5F9",

  color:
    "#64748B",

  fontSize:
    "9px",

  fontWeight:
    "900",

  textTransform:
    "uppercase",
};

const designationActionStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "7px",

  flexWrap:
    "wrap",
};

const unmapButtonStyle = {
  padding:
    "8px 12px",

  border:
    "1px solid #FCA5A5",

  borderRadius:
    "7px",

  background:
    "#FFF7F7",

  color:
    "#B91C1C",

  fontFamily:
    "inherit",

  fontSize:
    "11px",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

const recommendedDepartmentCreatingStyle = {
  minWidth:
    "215px",

  display:
    "flex",

  flexDirection:
    "column",

  gap:
    "4px",

  padding:
    "11px 14px",

  border:
    "1px solid #D9C26A",

  borderRadius:
    "9px",

  background:
    "#FFFDF5",

  color:
    "#7C5A00",

  fontSize:
    "10px",
};

export default Designations;