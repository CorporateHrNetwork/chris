import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FaCheckCircle,
  FaClipboardCheck,
  FaEdit,
  FaPlus,
  FaSave,
  FaTasks,
  FaUserCheck,
} from "react-icons/fa";

import {
  apiRequest,
} from "../services/api";
import OnboardingSectionDataForm from "../components/employees/OnboardingSectionDataForm";
import OnboardingDocumentsForm from "../components/employees/OnboardingDocumentsForm";
import {
  COUNTRY_CATALOG,
  getCountryByCode,
  getCountryByName,
  getCountryFlag,
} from "../data/countryCatalog";
import {
  NIGERIA_STATES,
  getNigeriaLgas,
} from "../data/nigeriaStatesLgas";

function countryFlagPath(code) {
  return `/flags/${String(
    code || ""
  )
    .trim()
    .toLowerCase()}.png`;
}
const EMPTY_PERSONAL_FORM = {
  fullName: "",
  email: "",
  phone: "",
  alternativePhone: "",
  gender: "UNSPECIFIED",
  dateOfBirth: "",
  maritalStatus: "",
  nationality: "",
  residentialAddress: "",
  lga: "",
  state: "",
  country: "Nigeria",
  idType: "",
  idNumber: "",
  idExpiryDate: "",
  citizenshipCountryCode: "NG",
  residenceCountryCode: "NG",
  phoneCountryCode: "NG",
  alternativePhoneCountryCode: "NG",};

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeGenderValue(value) {
  const normalized =
    String(value || "")
      .trim()
      .toUpperCase();

  return [
    "MALE",
    "FEMALE",
    "OTHER",
    "UNSPECIFIED",
  ].includes(normalized)
    ? normalized
    : "UNSPECIFIED";
}

function calculatePersonalCompletedItems(form) {
  return [
    Boolean(String(form.fullName || "").trim()),
    Boolean(String(form.phone || "").trim()),
    Boolean(String(form.email || "").trim()),
    Boolean(form.gender && form.gender !== "UNSPECIFIED"),
    Boolean(form.dateOfBirth),
    Boolean(form.maritalStatus),
    Boolean(String(form.nationality || "").trim()),
    Boolean(String(form.residentialAddress || "").trim()),
    Boolean(
      String(form.idType || "").trim() &&
      String(form.idNumber || "").trim()
    ),
  ].filter(Boolean).length;
}

const EMPLOYMENT_TYPES = [
  "Permanent",
  "Contract",
  "Temporary",
  "Probation",
  "Intern / Trainee",
  "Expatriate",
  "Casual",
  "Custom",
];

const NIGERIA_PFAS = [
  "Access ARM Pensions Limited",
  "Cardinal Stone Pensions Limited",
  "Citizens Pensions Limited",
  "Crusader Sterling Pensions Limited",
  "FCMB Pensions Limited",
  "Fidelity Pension Managers Limited",
  "Guaranty Trust Pension Managers Limited",
  "Leadway PFA Limited",
  "Nigerian University Pension Management Company (NUPEMCO)",
  "NLPC Pension Fund Administrators Limited",
  "Norrenberger Pensions Limited",
  "NPF Pension Managers Limited",
  "OAK Pensions Limited",
  "Parthian Pensions Limited",
  "Premium Pension Limited",
  "Stanbic IBTC Pension Managers Limited",
  "Tangerine APT Pensions Limited",
  "Trustfund Pensions Limited",
  "Veritas Glanvills Pensions Limited",
];
const WORKFLOW_NAME_OPTIONS = [
  "Permanent Employee Onboarding",
  "Contract Employee Onboarding",
  "Temporary Employee Onboarding",
  "Probation Employee Onboarding",
  "Intern / Trainee Onboarding",
  "Expatriate Employee Onboarding",
  "Casual Employee Onboarding",
  "Custom Workflow",
];

const DEFAULT_SECTIONS = [
  {
    key: "personal-details",
    label: "Personal Details",
    description:
      "Identity, contact, demographic and residential employee information.",
    required: true,
    items: [
      "Name",
      "Phone Number",
      "Email Address",
      "Gender",
      "Date of Birth",
      "Marital Status",
      "Nationality",
      "Address",
      "ID Details",
    ],
  },
  {
    key: "statutory-details",
    label: "Statutory Details",
    description:
      "Required statutory and compliance information for the employee.",
    required: true,
    items: [
      "Tax / PAYE Information",
      "Pension / PFA / PIN",
      "NHIA / Health Information",
      "Other Statutory Requirements",
    ],
  },
  {
    key: "payment-details",
    label: "Payment Details",
    description:
      "Banking and payroll payment information.",
    required: true,
    items: [
      "Bank Name",
      "Account Name",
      "Account Number",
      "Payroll Currency",
      "Payment Method",
    ],
  },
  {
    key: "documents",
    label: "Documents",
    description:
      "Employee documents required for employment and onboarding completion.",
    required: true,
    items: [
      "CV / Resume",
      "Offer / Appointment Letter",
      "Valid ID",
      "Certificates",
      "Passport Photograph",
      "Other Required Documents",
    ],
  },
  {
    key: "next-of-kin",
    label: "Next of Kin",
    description:
      "Primary next-of-kin information.",
    required: true,
    items: [
      "Name",
      "Relationship",
      "Phone Number",
      "Address",
    ],
  },
  {
    key: "emergency-contact",
    label: "Emergency Contact",
    description:
      "Emergency contact information, independent of Next of Kin where required.",
    required: true,
    items: [
      "Name",
      "Relationship",
      "Phone Number",
      "Alternative Phone",
    ],
  },
  {
    key: "legal",
    label: "Legal",
    description:
      "Employment acknowledgements, declarations, policies and legal documents.",
    required: true,
    items: [
      "Employment Contract",
      "Confidentiality / NDA",
      "Policy Acknowledgements",
      "Data Privacy Consent",
    ],
  },
  {
    key: "assets",
    label: "Assets",
    description:
      "Assets, equipment and access items issued to the employee.",
    required: false,
    items: [
      "Laptop / Computer",
      "Phone",
      "ID / Access Card",
      "PPE",
      "Other Assigned Assets",
    ],
  },
];

const STATUS_LABELS = {
  DRAFT: "Draft",
  IN_PROGRESS: "In Progress",
  AWAITING_EMPLOYEE: "Awaiting Employee",
  AWAITING_HR: "Awaiting HR",
  READY_FOR_ACTIVATION: "Ready for Activation",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
};

function EmployeeOnboarding() {
  const [tab, setTab] =
    useState("WORKFLOWS");

  const [templates, setTemplates] =
    useState([]);

  const [records, setRecords] =
    useState([]);

  const [employees, setEmployees] =
    useState([]);

  const [showCreate, setShowCreate] =
    useState(false);

  const [
    workflowNameChoice,
    setWorkflowNameChoice,
  ] = useState(
    "Permanent Employee Onboarding"
  );

  const [
    customWorkflowName,
    setCustomWorkflowName,
  ] = useState("");

  const [
    employmentType,
    setEmploymentType,
  ] = useState("Permanent");

  const [
    selectedSections,
    setSelectedSections,
  ] = useState(DEFAULT_SECTIONS);

  const [
    employeeNumber,
    setEmployeeNumber,
  ] = useState("");

  const [
    templateId,
    setTemplateId,
  ] = useState("");

  const [
    selectedRecord,
    setSelectedRecord,
  ] = useState(null);

  const [
    selectedSectionKey,
    setSelectedSectionKey,
  ] = useState("");

  const [
    sectionItems,
    setSectionItems,
  ] = useState([]);

  const [
    savingSection,
    setSavingSection,
  ] = useState(false);
  const [
    sectionForm,
    setSectionForm,
  ] = useState(
    EMPTY_PERSONAL_FORM
  );
  const [
    sectionDataForm,
    setSectionDataForm,
  ] = useState({});

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const [
        templateResult,
        recordResult,
        employeeResult,
      ] = await Promise.all([
        apiRequest(
          "/api/employees/onboarding/templates"
        ),
        apiRequest(
          "/api/employees/onboarding/status"
        ),
        apiRequest(
          "/api/employees"
        ),
      ]);

      setTemplates(
        templateResult?.data || []
      );

      setRecords(
        recordResult?.data || []
      );

      setEmployees(
        employeeResult?.data || []
      );
    } catch (err) {
      setError(
        err?.message ||
          "Unable to load onboarding information."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);
  /*
  AUTO-CLEAR ONBOARDING FEEDBACK
  */
  useEffect(() => {
    if (!message && !error) {
      return undefined;
    }

    const timer =
      window.setTimeout(() => {
        setMessage("");
        setError("");
      }, 6000);

    return () =>
      window.clearTimeout(timer);
  }, [message, error]);


  const activeTemplates =
    useMemo(
      () =>
        templates.filter(
          (item) =>
            item.isActive !== false
        ),
      [templates]
    );

  const selectedEmployee =
    useMemo(
      () =>
        employees.find(
          (employee) =>
            employee.employeeNumber ===
            employeeNumber
        ) || null,
      [
        employees,
        employeeNumber,
      ]
    );

  const filteredTemplates =
    useMemo(() => {
      const type =
        selectedEmployee
          ?.employmentType ||
        selectedEmployee
          ?.employmentTypeName ||
        "";

      if (!type) {
        return activeTemplates;
      }

      const matching =
        activeTemplates.filter(
          (template) =>
            !template.employmentType ||
            String(
              template.employmentType
            ).toLowerCase() ===
              String(type).toLowerCase()
        );

      return matching.length
        ? matching
        : activeTemplates;
    }, [
      activeTemplates,
      selectedEmployee,
    ]);

  const availableLgas =
    useMemo(
      () =>
        getNigeriaLgas(
          sectionForm.state
        ),
      [
        sectionForm.state,
      ]
    );
  const resolvedWorkflowName =
    workflowNameChoice ===
    "Custom Workflow"
      ? customWorkflowName.trim()
      : workflowNameChoice;

  const activeSection =
    useMemo(() => {
      if (
        !selectedRecord ||
        !selectedSectionKey
      ) {
        return null;
      }

      return (
        selectedRecord.template
          ?.sections?.find(
            (section) =>
              section.key ===
              selectedSectionKey
          ) || null
      );
    }, [
      selectedRecord,
      selectedSectionKey,
    ]);

  async function createWorkflow() {
    try {
      setError("");
      setMessage("");

      if (
        !resolvedWorkflowName
      ) {
        setError(
          "Select or enter a workflow name."
        );
        return;
      }

      const result =
        await apiRequest(
          "/api/employees/onboarding/templates",
          {
            method: "POST",
            body: {
              name:
                resolvedWorkflowName,
              employmentType:
                employmentType ===
                "Custom"
                  ? null
                  : employmentType,
              sections:
                selectedSections.map(
                  (
                    section,
                    index
                  ) => ({
                    ...section,
                    order:
                      index + 1,
                  })
                ),
            },
          }
        );

      setMessage(
        result?.message ||
          "Onboarding workflow created."
      );

      setShowCreate(false);
      await load();
    } catch (err) {
      setError(
        err?.message ||
          "Unable to create onboarding workflow."
      );
    }
  }

  async function startOnboarding() {
    try {
      setError("");
      setMessage("");

      if (
        !employeeNumber ||
        !templateId
      ) {
        setError(
          "Select an employee and onboarding workflow."
        );
        return;
      }

      if (!Number.isInteger(selectedEmployee?.designation?.careerLevel)) {
        setError(
          "Configure the employee's designation and Employment Level before starting onboarding."
        );
        return;
      }

      const result =
        await apiRequest(
          `/api/employees/onboarding/${encodeURIComponent(
            employeeNumber
          )}`,
          {
            method: "POST",
            body: {
              templateId,
            },
          }
        );

      setMessage(
        result?.message ||
          "Employee onboarding started."
      );

      setEmployeeNumber("");
      setTemplateId("");

      await load();

      setTab("STATUS");
    } catch (err) {
      setError(
        err?.message ||
          "Unable to start employee onboarding."
      );
    }
  }

  function toggleSection(key) {
    setSelectedSections(
      (current) => {
        const exists =
          current.some(
            (item) =>
              item.key === key
          );

        if (exists) {
          return current.filter(
            (item) =>
              item.key !== key
          );
        }

        const section =
          DEFAULT_SECTIONS.find(
            (item) =>
              item.key === key
          );

        return section
          ? [
              ...current,
              section,
            ]
          : current;
      }
    );
  }

  async function openSection(
    record,
    section
  ) {
    setSelectedRecord(record);
    setSelectedSectionKey(
      section.key
    );

    /*
    Bring the active data-entry workspace into view after
    the selected section has rendered.
    */
    window.setTimeout(() => {
      document
        .getElementById(
          "chris-onboarding-section-editor"
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 80);

    const progress =
      record.sectionProgress?.[
        section.key
      ] || {};

    const completedKeys =
      Array.isArray(
        progress.completedItemKeys
      )
        ? progress.completedItemKeys
        : [];

    setSectionItems(
      section.items.map(
        (item) => ({
          label: item,
          completed:
            completedKeys.includes(
              item
            ),
        })
      )
    );

    if (
      section.key !==
        "personal-details" &&
      section.key !==
        "documents"
    ) {
      setSectionDataForm(
        record.sectionData?.[
          section.key
        ] || {}
      );
    }
    if (
      section.key ===
      "personal-details"
    ) {
      try {
        const employeeResult =
          await apiRequest(
            `/api/employees/${encodeURIComponent(
              record.employee
                ?.employeeNumber
            )}`
          );

        const employee =
          employeeResult?.data ||
          record.employee ||
          {};

        const saved =
          record.sectionData?.[
            "personal-details"
          ] || {};

        setSectionForm({
          ...EMPTY_PERSONAL_FORM,
          fullName:
            saved.fullName ||
            [
              employee.firstName,
              employee.middleName,
              employee.lastName,
            ]
              .filter(Boolean)
              .join(" "),
          email:
            saved.email ||
            employee.email ||
            "",
          phone:
            saved.phone ||
            employee.phone ||
            "",
          alternativePhone:
            saved.alternativePhone ||
            "",
          gender:
            normalizeGenderValue(
              saved.gender ||
              employee.gender
            ),
          dateOfBirth:
            toDateInput(
              saved.dateOfBirth
            ),
          maritalStatus:
            saved.maritalStatus ||
            "",
          nationality:
            saved.nationality ||
            "",
          residentialAddress:
            saved.residentialAddress ||
            "",
          lga:
            saved.lga ||
            saved.city ||
            "",
          state:
            saved.state || "",
          country:
            saved.country ||
            "Nigeria",
          idType:
            saved.idType || "",
          idNumber:
            saved.idNumber || "",
          idExpiryDate:
            toDateInput(
              saved.idExpiryDate
            ),
          citizenshipCountryCode:
            saved.citizenshipCountryCode ||
            getCountryByName(
              saved.nationality ===
              "Nigerian"
                ? "Nigeria"
                : saved.country
            )?.code ||
            "NG",
          residenceCountryCode:
            saved.residenceCountryCode ||
            getCountryByName(
              saved.country ||
              "Nigeria"
            )?.code ||
            "NG",
          phoneCountryCode:
            saved.phoneCountryCode ||
            "NG",
          alternativePhoneCountryCode:
            saved.alternativePhoneCountryCode ||
            "NG",        });
      } catch (err) {
        setError(
          err?.message ||
            "Unable to load employee personal details."
        );
      }
    }
  }

  function handleSectionFormChange(
    event
  ) {
    const {
      name,
      value,
    } = event.target;

    setSectionForm(
      (current) => {
        if (
          name === "state"
        ) {
          return {
            ...current,
            state: value,
            lga: "",
          };
        }

        if (
          name ===
          "citizenshipCountryCode"
        ) {
          const country =
            getCountryByCode(
              value
            );

          return {
            ...current,
            citizenshipCountryCode:
              value,
            nationality:
              country?.nationality ||
              "",
          };
        }

        if (
          name ===
          "residenceCountryCode"
        ) {
          const country =
            getCountryByCode(
              value
            );

          return {
            ...current,
            residenceCountryCode:
              value,
            country:
              country?.name || "",
            state: "",
            lga: "",
          };
        }

        if (
          name ===
          "phoneCountryCode"
        ) {
          return {
            ...current,
            phoneCountryCode:
              value,
          };
        }

        if (
          name ===
          "alternativePhoneCountryCode"
        ) {
          return {
            ...current,
            alternativePhoneCountryCode:
              value,
          };
        }

        return {
          ...current,
          [name]: value,
        };
      }
    );
  }
  function toggleSectionItem(
    label
  ) {
    setSectionItems(
      (current) =>
        current.map(
          (item) =>
            item.label === label
              ? {
                  ...item,
                  completed:
                    !item.completed,
                }
              : item
        )
    );
  }

  async function saveSection() {
    if (
      !selectedRecord ||
      !activeSection
    ) {
      return;
    }

    setSavingSection(true);
    setError("");
    setMessage("");

    try {
      let completedItemKeys =
        sectionItems
          .filter(
            (item) =>
              item.completed
          )
          .map(
            (item) =>
              item.label
          );

      let completedItems =
        completedItemKeys.length;

      let completed =
        activeSection.items
          .length === 0 ||
        completedItems ===
          activeSection.items.length;

      const body = {
        completed,
        completedItems,
        completedItemKeys,
      };

      if (
        activeSection.key ===
        "personal-details"
      ) {
        completedItems =
          calculatePersonalCompletedItems(
            sectionForm
          );

        completed =
          completedItems >=
          activeSection.items.length;

        body.completed =
          completed;

        body.completedItems =
          completedItems;

        body.data = {
          ...sectionForm,
        };
      }

      if (
        activeSection.key !==
          "personal-details" &&
        activeSection.key !==
          "documents"
      ) {
        body.data = {
          ...sectionDataForm,
        };
      }

      const result =
        await apiRequest(
          `/api/employees/onboarding/records/${encodeURIComponent(
            selectedRecord.id
          )}/sections/${encodeURIComponent(
            activeSection.key
          )}`,
          {
            method: "PATCH",
            body,
          }
        );

      if (result?.data) {
        setSelectedRecord(
          result.data
        );
      }

      setMessage(
        result?.message ||
          "Onboarding section updated successfully."
      );

      try {
        const [
          templateResult,
          recordResult,
          employeeResult,
        ] = await Promise.all([
          apiRequest(
            "/api/employees/onboarding/templates"
          ),
          apiRequest(
            "/api/employees/onboarding/status"
          ),
          apiRequest(
            "/api/employees"
          ),
        ]);

        setTemplates(
          templateResult?.data || []
        );

        setRecords(
          recordResult?.data || []
        );

        setEmployees(
          employeeResult?.data || []
        );

        if (result?.data?.id) {
          const refreshedRecord =
            (recordResult?.data || [])
              .find(
                (item) =>
                  item.id ===
                  result.data.id
              );

          if (refreshedRecord) {
            setSelectedRecord(
              refreshedRecord
            );
          }
        }
      } catch (refreshError) {
        console.error(
          "Onboarding post-save refresh error:",
          refreshError
        );
      }
    } catch (err) {
      console.error(
        "Onboarding save error:",
        err
      );

      setError(
        err?.message ||
          "Unable to update onboarding section."
      );
    } finally {
      setSavingSection(false);
    }
  }
  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>
            EMPLOYEE ONBOARDING
          </div>

          <h1 style={titleStyle}>
            Onboarding
          </h1>

          <p style={descriptionStyle}>
            Configure onboarding workflows,
            complete employee onboarding
            sections, and monitor readiness
            across required employment
            stages.
          </p>
        </div>

        {tab === "WORKFLOWS" ? (
          <button
            type="button"
            style={
              primaryButtonStyle
            }
            onClick={() =>
              setShowCreate(
                (value) =>
                  !value
              )
            }
          >
            <FaPlus />
            Create Onboarding
            Workflow
          </button>
        ) : null}
      </div>

      <div style={tabsStyle}>
        <TabButton
          active={
            tab ===
            "WORKFLOWS"
          }
          onClick={() =>
            setTab(
              "WORKFLOWS"
            )
          }
        >
          Workflow Templates
        </TabButton>

        <TabButton
          active={
            tab === "STATUS"
          }
          onClick={() =>
            setTab("STATUS")
          }
        >
          Onboarding Status
        </TabButton>
      </div>

      {message && !selectedRecord ? (
        <div
          style={
            successStyle
          }
        >
          {message}
        </div>
      ) : null}

      {error && !selectedRecord ? (
        <div style={errorStyle}>
          {error}
        </div>
      ) : null}

      {showCreate &&
      tab === "WORKFLOWS" ? (
        <section
          style={builderStyle}
        >
          <div
            style={
              builderMainStyle
            }
          >
            <h2
              style={
                panelTitleStyle
              }
            >
              Workflow Builder
            </h2>

            <div
              style={
                formGridStyle
              }
            >
              <Field label="Workflow Name">
                <select
                  value={
                    workflowNameChoice
                  }
                  onChange={(
                    event
                  ) =>
                    setWorkflowNameChoice(
                      event.target
                        .value
                    )
                  }
                  style={inputStyle}
                >
                  {WORKFLOW_NAME_OPTIONS.map(
                    (name) => (
                      <option
                        key={name}
                        value={name}
                      >
                        {name}
                      </option>
                    )
                  )}
                </select>
              </Field>

              {workflowNameChoice ===
              "Custom Workflow" ? (
                <Field label="Custom Workflow Name">
                  <input
                    value={
                      customWorkflowName
                    }
                    onChange={(
                      event
                    ) =>
                      setCustomWorkflowName(
                        event.target
                          .value
                      )
                    }
                    style={
                      inputStyle
                    }
                    placeholder="Enter workflow name"
                  />
                </Field>
              ) : null}

              <Field label="Employment Type">
                <select
                  value={
                    employmentType
                  }
                  onChange={(
                    event
                  ) =>
                    setEmploymentType(
                      event.target
                        .value
                    )
                  }
                  style={inputStyle}
                >
                  {EMPLOYMENT_TYPES.map(
                    (type) => (
                      <option
                        key={type}
                        value={type}
                      >
                        {type}
                      </option>
                    )
                  )}
                </select>
              </Field>
            </div>

            <div
              style={
                sectionStackStyle
              }
            >
              {selectedSections.map(
                (
                  section,
                  index
                ) => (
                  <div
                    key={
                      section.key
                    }
                    style={
                      workflowSectionStyle
                    }
                  >
                    <div
                      style={
                        sectionNumberStyle
                      }
                    >
                      {index + 1}
                    </div>

                    <div>
                      <h3
                        style={
                          sectionTitleStyle
                        }
                      >
                        {section.label}
                      </h3>

                      <p
                        style={
                          sectionDescriptionStyle
                        }
                      >
                        {
                          section.description
                        }
                      </p>

                      <div
                        style={
                          chipWrapStyle
                        }
                      >
                        {section.items.map(
                          (item) => (
                            <span
                              key={
                                item
                              }
                              style={
                                chipStyle
                              }
                            >
                              {item}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          <aside
            style={
              builderSideStyle
            }
          >
            <h3
              style={
                panelTitleStyle
              }
            >
              Workflow Components
            </h3>

            <p
              style={
                descriptionStyle
              }
            >
              Select the sections
              that apply to this
              onboarding workflow.
            </p>

            <div
              style={
                componentListStyle
              }
            >
              {DEFAULT_SECTIONS.map(
                (section) => {
                  const checked =
                    selectedSections.some(
                      (item) =>
                        item.key ===
                        section.key
                    );

                  return (
                    <label
                      key={
                        section.key
                      }
                      style={
                        componentRowStyle
                      }
                    >
                      <input
                        type="checkbox"
                        checked={
                          checked
                        }
                        onChange={() =>
                          toggleSection(
                            section.key
                          )
                        }
                      />

                      <span>
                        {section.label}
                        {section.required
                          ? " *"
                          : ""}
                      </span>
                    </label>
                  );
                }
              )}
            </div>

            <button
              type="button"
              style={
                primaryButtonStyle
              }
              onClick={
                createWorkflow
              }
            >
              <FaSave />
              Save Workflow
            </button>
          </aside>
        </section>
      ) : null}

      {tab === "WORKFLOWS" ? (
        <div
          style={
            cardGridStyle
          }
        >
          {loading ? (
            <div
              style={
                emptyStyle
              }
            >
              Loading workflows...
            </div>
          ) : activeTemplates.length ? (
            activeTemplates.map(
              (template) => (
                <article
                  key={
                    template.id
                  }
                  style={
                    workflowCardStyle
                  }
                >
                  <div
                    style={
                      workflowVisualStyle
                    }
                  >
                    <FaClipboardCheck />
                  </div>

                  <div
                    style={
                      workflowBodyStyle
                    }
                  >
                    <h3
                      style={
                        cardTitleStyle
                      }
                    >
                      {template.name}
                    </h3>

                    <div
                      style={
                        mutedStyle
                      }
                    >
                      {template.employmentType ||
                        "General"}{" "}
                      &middot;{" "}
                      {Array.isArray(
                        template.sections
                      )
                        ? template
                            .sections
                            .length
                        : 0}{" "}
                      sections
                    </div>

                    <div
                      style={
                        cardFooterStyle
                      }
                    >
                      <span
                        style={
                          statusPillStyle
                        }
                      >
                        {template.isActive
                          ? "Active"
                          : "Inactive"}
                      </span>

                      <span
                        style={
                          mutedStyle
                        }
                      >
                        {formatDate(
                          template.createdAt
                        )}
                      </span>
                    </div>
                  </div>
                </article>
              )
            )
          ) : (
            <div
              style={
                emptyStyle
              }
            >
              No onboarding
              workflows yet.
            </div>
          )}
        </div>
      ) : (
        <>
          <section
            style={
              startPanelStyle
            }
          >
            <div>
              <h2
                style={
                  panelTitleStyle
                }
              >
                Start Employee
                Onboarding
              </h2>

              <p
                style={
                  descriptionStyle
                }
              >
                Select an employee
                and assign the
                appropriate active
                workflow.
              </p>
            </div>

            <div
              style={
                startGridStyle
              }
            >
              <Field label="Employee">
                <select
                  value={
                    employeeNumber
                  }
                  onChange={(
                    event
                  ) => {
                    setEmployeeNumber(
                      event.target
                        .value
                    );
                    setTemplateId(
                      ""
                    );
                  }}
                  style={inputStyle}
                >
                  <option value="">
                    Select employee
                  </option>

                  {employees.map(
                    (
                      employee
                    ) => (
                      <option
                        key={
                          employee.id
                        }
                        value={
                          employee.employeeNumber
                        }
                      >
                        {
                          employee.employeeNumber
                        }{" "}
                        {" "}
                      {[
                          employee.firstName,
                          employee.middleName,
                          employee.lastName,
                        ]
                          .filter(
                            Boolean
                          )
                          .join(
                            " "
                          )}
                        {employee.designation?.name
                          ? ` — ${employee.designation.name}`
                          : " — Designation required"}
                      </option>
                    )
                  )}
                </select>
              </Field>

              <Field label="Designation / Employment Level">
                <input
                  value={selectedEmployee
                    ? `${selectedEmployee.designation?.name || "Not configured"} — ${selectedEmployee.designation?.employmentLevel?.name || (Number.isInteger(selectedEmployee.designation?.careerLevel) ? `Level ${selectedEmployee.designation.careerLevel}` : "Employment Level required")}`
                    : "Select employee first"}
                  disabled
                  style={readOnlyInputStyle}
                />
              </Field>

              <Field label="Workflow Name">
                <select
                  value={
                    templateId
                  }
                  onChange={(
                    event
                  ) =>
                    setTemplateId(
                      event.target
                        .value
                    )
                  }
                  style={inputStyle}
                >
                  <option value="">
                    Select workflow
                  </option>

                  {filteredTemplates.map(
                    (
                      template
                    ) => (
                      <option
                        key={
                          template.id
                        }
                        value={
                          template.id
                        }
                      >
                        {
                          template.name
                        }
                      </option>
                    )
                  )}
                </select>
              </Field>

              <button
                type="button"
                style={
                  primaryButtonStyle
                }
                onClick={
                  startOnboarding
                }
              >
                <FaUserCheck />
                Start Onboarding
              </button>
            </div>
          </section>

          <section
            style={panelStyle}
          >
            <div
              style={
                panelHeaderStyle
              }
            >
              <div>
                <h2
                  style={
                    panelTitleStyle
                  }
                >
                  Onboarding Status
                </h2>

                <p
                  style={
                    descriptionStyle
                  }
                >
                  Click an onboarding
                  section to complete its
                  requirements.
                </p>
              </div>

              <FaTasks
                style={
                  panelIconStyle
                }
              />
            </div>

            <div
              style={
                statusCardGridStyle
              }
            >
              {records.length ? (
                records.map(
                  (record) => (
                    <article
                      key={
                        record.id
                      }
                      style={
                        recordCardStyle
                      }
                    >
                      <div
                        style={
                          recordHeaderStyle
                        }
                      >
                        <div>
                          <strong>
                            {
                              record.employee
                                ?.employeeNumber
                            }
                          </strong>

                          <div
                            style={
                              mutedStyle
                            }
                          >
                            {employeeName(
                              record.employee
                            )}
                          </div>
                        </div>

                        <span
                          style={
                            statusPillStyle
                          }
                        >
                          {STATUS_LABELS[
                            record
                              .status
                          ] ||
                            record.status}
                        </span>
                      </div>

                      <div
                        style={
                          progressBlockStyle
                        }
                      >
                        <div
                          className="chris-progress"
                        >
                          <div
                            className="chris-progress__bar"
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(
                                  100,
                                  Number(
                                    record.completionPercent ||
                                      0
                                  )
                                )
                              )}%`,
                            }}
                          />
                        </div>

                        <strong>
                          {Number(
                            record.completionPercent ||
                              0
                          )}
                          %
                        </strong>
                      </div>

                      <div
                        style={
                          recordMetaStyle
                        }
                      >
                        <span>
                          {
                            record.template
                              ?.name
                          }
                        </span>

                        <span>
                          Current:{" "}
                          {record.currentStage ||
                            "Not Started"}
                        </span>
                      </div>

                      <div
                        style={
                          sectionButtonGridStyle
                        }
                      >
                        {(
                          record.template
                            ?.sections ||
                          []
                        ).map(
                          (
                            section
                          ) => {
                            const progress =
                              record
                                .sectionProgress?.[
                                section
                                  .key
                              ] ||
                              {};

                            const complete =
                              progress.completed ===
                              true;

                            const started =
                              Number(
                                progress.completedItems ||
                                  0
                              ) > 0;

                            return (
                              <button
                                type="button"
                                key={
                                  section.key
                                }
                                onClick={() =>
                                  openSection(
                                    record,
                                    section
                                  )
                                }
                                style={{
                                  ...sectionButtonStyle,
                                  ...(selectedRecord?.id ===
                                      record.id &&
                                    selectedSectionKey ===
                                      section.key
                                      ? activeEditingSectionStyle
                                      : {}),
                                  ...(complete
                                    ? completedSectionStyle
                                    : started
                                      ? inProgressSectionStyle
                                      : {}),
                                }}
                              >
                                <span>
                                  {complete ? (
                                    <FaCheckCircle />
                                  ) : (
                                    <FaEdit />
                                  )}
                                </span>

                                <strong>
                                  {
                                    section.label
                                  }
                                </strong>

                                <small>
                                  {Number(
                                    progress.completedItems ||
                                      0
                                  )}
                                  /
                                  {Array.isArray(
                                    section.items
                                  )
                                    ? section
                                        .items
                                        .length
                                    : 0}{" "}
                                  items
                                </small>
                              </button>
                            );
                          }
                        )}
                      </div>
                    </article>
                  )
                )
              ) : (
                <div
                  style={
                    emptyStyle
                  }
                >
                  No employees are
                  currently in
                  onboarding.
                </div>
              )}
            </div>
          </section>

          {selectedRecord &&
          activeSection ? (
            <section
              id="chris-onboarding-section-editor"
              style={
                editorPanelStyle
              }
            >
              {(message || error) ? (
                <div
                  id="chris-onboarding-editor-feedback"
                  style={
                    error
                      ? editorErrorStyle
                      : editorSuccessStyle
                  }
                >
                  {error || message}
                </div>
              ) : null}
              <div
                style={
                  panelHeaderStyle
                }
              >
                <div>
                  <div
                    style={
                      eyebrowStyle
                    }
                  >
                    ONBOARDING
                    SECTION
                  </div>

                  <h2
                    style={
                      panelTitleStyle
                    }
                  >
                    {
                      activeSection.label
                    }
                  </h2>

                  <p
                    style={
                      descriptionStyle
                    }
                  >
                    {employeeName(
                      selectedRecord.employee
                    )}
                    <span
                      aria-hidden="true"
                      style={{
                        margin: "0 7px",
                        color:
                          "var(--chris-gold)",
                        fontWeight: 900,
                      }}
                    >
                      |
                    </span>
                    {
                      selectedRecord.employee
                        ?.employeeNumber
                    }
                  </p>
                </div>

                <button
                  type="button"
                  style={
                    secondaryButtonStyle
                  }
                  onClick={() => {
                    setSelectedRecord(
                      null
                    );
                    setSelectedSectionKey(
                      ""
                    );
                    setSectionItems(
                      []
                    );
                    setSectionForm(
                      EMPTY_PERSONAL_FORM
                    );
                    setSectionDataForm(
                      {}
                    );
                  }}
                >
                  Close
                </button>
              </div>

                            {activeSection.key === "personal-details" ? (
                <>
                  <div style={personalFormGridStyle}>
                    <Field label="Employee ID">
                      <input
                        value={
                          selectedRecord.employee
                            ?.employeeNumber || ""
                        }
                        disabled
                        style={readOnlyInputStyle}
                      />
                    </Field>

                    <Field label="Full Name *">
                      <input
                        name="fullName"
                        value={sectionForm.fullName}
                        onChange={handleSectionFormChange}
                        style={inputStyle}
                      />
                    </Field>

                    <Field label="Email Address *">
                      <input
                        type="email"
                        name="email"
                        value={sectionForm.email}
                        onChange={handleSectionFormChange}
                        style={inputStyle}
                      />
                    </Field>

                    <Field label="Phone Number *">
                      <div style={phoneFieldGridStyle}>
                        <div style={flagDialControlStyle}>
                          <img
                            src={countryFlagPath(
                              sectionForm.phoneCountryCode
                            )}
                            alt=""
                            aria-hidden="true"
                            style={countryFlagStyle}
                          />

                          <select
                            name="phoneCountryCode"
                            value={sectionForm.phoneCountryCode}
                            onChange={handleSectionFormChange}
                            style={dialCodeSelectStyle}
                          >
                            {COUNTRY_CATALOG.map(
                              (country) => (
                                <option
                                  key={country.code}
                                  value={country.code}
                                >
                                  {country.dialCode}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <input
                          name="phone"
                          value={sectionForm.phone}
                          onChange={handleSectionFormChange}
                          style={inputStyle}
                        />
                      </div>
                    </Field>

                    <Field label="Alternative Phone">
                      <div style={phoneFieldGridStyle}>
                        <div style={flagDialControlStyle}>
                          <img
                            src={countryFlagPath(
                              sectionForm.alternativePhoneCountryCode
                            )}
                            alt=""
                            aria-hidden="true"
                            style={countryFlagStyle}
                          />

                          <select
                            name="alternativePhoneCountryCode"
                            value={sectionForm.alternativePhoneCountryCode}
                            onChange={handleSectionFormChange}
                            style={dialCodeSelectStyle}
                          >
                            {COUNTRY_CATALOG.map(
                              (country) => (
                                <option
                                  key={country.code}
                                  value={country.code}
                                >
                                  {country.dialCode}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <input
                          name="alternativePhone"
                          value={sectionForm.alternativePhone}
                          onChange={handleSectionFormChange}
                          style={inputStyle}
                        />
                      </div>
                    </Field>

                    <Field label="Gender *">
                      <select
                        name="gender"
                        value={sectionForm.gender}
                        onChange={handleSectionFormChange}
                        style={inputStyle}
                      >
                        <option value="UNSPECIFIED">
                          Select gender
                        </option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </Field>

                    <Field label="Date of Birth *">
                      <input
                        type="date"
                        name="dateOfBirth"
                        value={sectionForm.dateOfBirth}
                        onChange={handleSectionFormChange}
                        style={inputStyle}
                      />
                    </Field>

                    <Field label="Marital Status *">
                      <select
                        name="maritalStatus"
                        value={sectionForm.maritalStatus}
                        onChange={handleSectionFormChange}
                        style={inputStyle}
                      >
                        <option value="">Select status</option>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Separated">Separated</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                      </select>
                    </Field>

                    <Field label="Citizenship / Nationality *">
                      <div style={countryFieldGridStyle}>
                        <div style={flagCountryControlStyle}>
                          <img
                            src={countryFlagPath(
                              sectionForm.citizenshipCountryCode
                            )}
                            alt=""
                            aria-hidden="true"
                            style={countryFlagStyle}
                          />

                          <select
                            name="citizenshipCountryCode"
                            value={sectionForm.citizenshipCountryCode}
                            onChange={handleSectionFormChange}
                            style={countryNameSelectStyle}
                          >
                            {COUNTRY_CATALOG.map(
                              (country) => (
                                <option
                                  key={country.code}
                                  value={country.code}
                                >
                                  {country.name}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <input
                          value={sectionForm.nationality}
                          readOnly
                          style={readOnlyInputStyle}
                        />
                      </div>
                    </Field>

                    <Field label="Country of Residence *">
                      <div style={flagCountryControlStyle}>
                        <img
                          src={countryFlagPath(
                            sectionForm.residenceCountryCode
                          )}
                          alt=""
                          aria-hidden="true"
                          style={countryFlagStyle}
                        />

                        <select
                          name="residenceCountryCode"
                          value={sectionForm.residenceCountryCode}
                          onChange={handleSectionFormChange}
                          style={countryNameSelectStyle}
                        >
                          {COUNTRY_CATALOG.map(
                            (country) => (
                              <option
                                key={country.code}
                                value={country.code}
                              >
                                {country.name}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </Field>

                    {sectionForm.residenceCountryCode === "NG" ? (
                    <>
                      <Field label="State *">
                        <select
                          name="state"
                          value={sectionForm.state}
                          onChange={handleSectionFormChange}
                          style={inputStyle}
                        >
                          <option value="">
                            Select state
                          </option>

                          {NIGERIA_STATES.map(
                            (state) => (
                              <option
                                key={state}
                                value={state}
                              >
                                {state}
                              </option>
                            )
                          )}
                        </select>
                      </Field>

                      <Field label="Local Government Area (LGA) *">
                        <select
                          name="lga"
                          value={sectionForm.lga}
                          onChange={handleSectionFormChange}
                          style={inputStyle}
                          disabled={!sectionForm.state}
                        >
                          <option value="">
                            {sectionForm.state
                              ? "Select LGA"
                              : "Select state first"}
                          </option>

                          {availableLgas.map(
                            (lga) => (
                              <option
                                key={lga}
                                value={lga}
                              >
                                {lga}
                              </option>
                            )
                          )}
                        </select>
                      </Field>
                    </>
                  ) : null}

<Field label="Residential Address *">
                      <textarea
                        name="residentialAddress"
                        value={sectionForm.residentialAddress}
                        onChange={handleSectionFormChange}
                        style={textareaStyle}
                        rows="3"
                      />
                    </Field>

                    <Field label="ID Type *">
                      <select
                        name="idType"
                        value={sectionForm.idType}
                        onChange={handleSectionFormChange}
                        style={inputStyle}
                      >
                        <option value="">Select ID type</option>
                        <option value="NIN">
                          National Identification Number (NIN)
                        </option>
                        <option value="PASSPORT">
                          International Passport
                        </option>
                        <option value="DRIVERS_LICENSE">
                          Driver&apos;s Licence
                        </option>
                        <option value="VOTERS_CARD">
                          Voter&apos;s Card
                        </option>
                        <option value="OTHER">Other</option>
                      </select>
                    </Field>

                    <Field label="ID Number *">
                      <input
                        name="idNumber"
                        value={sectionForm.idNumber}
                        onChange={handleSectionFormChange}
                        style={inputStyle}
                      />
                    </Field>

                    <Field label="ID Expiry Date">
                      <input
                        type="date"
                        name="idExpiryDate"
                        value={sectionForm.idExpiryDate}
                        onChange={handleSectionFormChange}
                        style={inputStyle}
                      />
                    </Field>
                  </div>

                  <div style={dataIntegrityNoteStyle}>
                    Existing employee master data is pre-populated.
                    Saving this section updates the permanent CHRIS
                    employee identity fields while onboarding-only
                    details remain attached to this onboarding record.
                  </div>
                </>
              ) : String(
                    activeSection.key || ""
                  )
                    .trim()
                    .toLowerCase()
                    .replace(/[_\s]+/g, "-") ===
                  "statutory-details" ? (
                <StatutoryDetailsInlineForm
                  value={sectionDataForm}
                  onChange={
                    setSectionDataForm
                  }
                />
              ) : activeSection.key ===
                "documents" ? (
                <OnboardingDocumentsForm
                  record={selectedRecord}
                  inputStyle={inputStyle}
                  onSaved={async (updated) => {
                    if (updated) {
                      setSelectedRecord(
                        updated
                      );
                    }

                    await load();
                  }}
                />
              ) : (
                <OnboardingSectionDataForm
                  sectionKey={
                    activeSection.key
                  }
                  value={sectionDataForm}
                  onChange={
                    setSectionDataForm
                  }
                  inputStyle={inputStyle}
                  textareaStyle={
                    textareaStyle
                  }
                />
              )}

<div
                style={
                  editorFooterStyle
                }
              >
                <span
                  style={
                    mutedStyle
                  }
                >
                  {activeSection.key ===
                  "personal-details"
                    ? calculatePersonalCompletedItems(
                        sectionForm
                      )
                    : Number(
                        selectedRecord
                          .sectionProgress?.[
                          activeSection.key
                        ]?.completedItems ||
                          0
                      )}
                  /
                  {activeSection.items.length}{" "}
                  completed
                </span>

                {activeSection.key !==
                "documents" ? (
                  <button
                    type="button"
                    style={
                      primaryButtonStyle
                    }
                    disabled={
                      savingSection
                    }
                    onClick={
                      saveSection
                    }
                  >
                    <FaSave />
                    {savingSection
                      ? "Saving..."
                      : "Save Section"}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function StatutoryDetailsInlineForm({
  value,
  onChange,
}) {
  const data = value || {};

  function setField(
    name,
    nextValue
  ) {
    onChange({
      ...data,
      [name]: nextValue,
    });
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(240px,1fr))",
        gap: 14,
      }}
    >
      <Field label="Tax Identification Number (TIN)">
        <input
          value={
            data.taxIdentificationNumber || ""
          }
          onChange={(event) =>
            setField(
              "taxIdentificationNumber",
              event.target.value
            )
          }
          style={inputStyle}
        />
      </Field>

      <Field label="PAYE State / Tax Authority">
        <select
          value={
            data.payeState || ""
          }
          onChange={(event) =>
            setField(
              "payeState",
              event.target.value
            )
          }
          style={inputStyle}
        >
          <option value="">
            Select PAYE state
          </option>

          {NIGERIA_STATES.map(
            (state) => (
              <option
                key={state}
                value={state}
              >
                {state}
              </option>
            )
          )}
        </select>
      </Field>

      <Field label="Pension Fund Administrator (PFA)">
        <select
          value={
            data.pensionPfa || ""
          }
          onChange={(event) =>
            setField(
              "pensionPfa",
              event.target.value
            )
          }
          style={inputStyle}
        >
          <option value="">
            Select Pension Fund Administrator
          </option>

          {NIGERIA_PFAS.map(
            (pfa) => (
              <option
                key={pfa}
                value={pfa}
              >
                {pfa}
              </option>
            )
          )}
        </select>
      </Field>

      <Field label="Retirement Savings Account (RSA) PIN">
        <input
          value={
            data.pensionPin || ""
          }
          onChange={(event) =>
            setField(
              "pensionPin",
              event.target.value
            )
          }
          style={inputStyle}
        />
      </Field>

      <Field label="NHIA / Health Insurance Number">
        <input
          value={
            data.nhiaNumber || ""
          }
          onChange={(event) =>
            setField(
              "nhiaNumber",
              event.target.value
            )
          }
          style={inputStyle}
        />
      </Field>

      <Field label="Other Statutory Requirements">
        <select
          value={
            data.otherStatutoryStatus || ""
          }
          onChange={(event) =>
            setField(
              "otherStatutoryStatus",
              event.target.value
            )
          }
          style={inputStyle}
        >
          <option value="">
            Select option
          </option>
          <option value="Completed">
            Completed
          </option>
          <option value="Not Applicable">
            Not Applicable
          </option>
          <option value="Pending">
            Pending
          </option>
        </select>
      </Field>

      <Field label="Other Statutory Notes">
        <textarea
          value={
            data.otherStatutoryNotes || ""
          }
          onChange={(event) =>
            setField(
              "otherStatutoryNotes",
              event.target.value
            )
          }
          style={textareaStyle}
          rows="3"
        />
      </Field>
    </div>
  );
}
function TabButton({
  active,
  children,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...tabButtonStyle,
        color: active
          ? "var(--chris-gold)"
          : "var(--chris-text-secondary)",
        borderBottom: active
          ? "2px solid var(--chris-gold)"
          : "2px solid transparent",
      }}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}) {
  return (
    <label
      style={fieldStyle}
    >
      <span
        style={
          fieldLabelStyle
        }
      >
        {label}
      </span>

      {children}
    </label>
  );
}

function employeeName(
  employee
) {
  if (!employee) {
    return "-";
  }

  return [
    employee.firstName,
    employee.middleName,
    employee.lastName,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "-";
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

const pageStyle = {
  color:
    "var(--chris-text-main)",
  fontFamily:
    "var(--chris-font-family)",
};

const headerStyle = {
  display: "flex",
  justifyContent:
    "space-between",
  alignItems:
    "flex-start",
  gap: 20,
  flexWrap: "wrap",
  marginBottom: 18,
};

const eyebrowStyle = {
  color:
    "var(--chris-gold)",
  fontSize:
    "var(--chris-font-sm)",
  fontWeight: 900,
  letterSpacing:
    ".12em",
};

const titleStyle = {
  margin: "7px 0 6px",
  color:
    "var(--chris-text-main)",
  fontSize:
    "var(--chris-font-2xl)",
  fontWeight: 900,
};

const descriptionStyle = {
  margin: 0,
  color:
    "var(--chris-text-secondary)",
  lineHeight: 1.55,
};

const primaryButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent:
    "center",
  gap: 8,
  border:
    "1px solid var(--chris-border-gold)",
  borderRadius:
    "var(--chris-radius-md)",
  padding:
    "11px 15px",
  background:
    "linear-gradient(135deg,var(--chris-gold),var(--chris-gold-deep))",
  color: "#07110C",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background:
    "rgba(255,255,255,.035)",
  color:
    "var(--chris-text-main)",
};

const tabsStyle = {
  display: "flex",
  gap: 8,
  borderBottom:
    "1px solid var(--chris-border-soft)",
  marginBottom: 18,
};

const tabButtonStyle = {
  padding:
    "10px 14px",
  background:
    "transparent",
  border: "none",
  fontWeight: 900,
  cursor: "pointer",
};

const builderStyle = {
  display: "grid",
  gridTemplateColumns:
    "minmax(0,2fr) minmax(280px,1fr)",
  gap: 18,
  marginBottom: 22,
};

const builderMainStyle = {
  padding: 20,
  borderRadius:
    "var(--chris-radius-card)",
  border:
    "1px solid var(--chris-border-gold)",
  background:
    "linear-gradient(145deg,rgba(12,38,26,.94),rgba(7,18,13,.98))",
};

const builderSideStyle = {
  padding: 20,
  borderRadius:
    "var(--chris-radius-card)",
  border:
    "1px solid var(--chris-border-gold)",
  background:
    "rgba(255,255,255,.025)",
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(220px,1fr))",
  gap: 14,
  marginTop: 16,
};

const fieldStyle = {
  display: "grid",
  gap: 7,
};

const fieldLabelStyle = {
  color:
    "var(--chris-text-secondary)",
  fontSize:
    "var(--chris-font-sm)",
  fontWeight: 800,
};

const inputStyle = {
  width: "100%",
  boxSizing:
    "border-box",
  padding:
    "11px 12px",
  borderRadius:
    "var(--chris-radius-md)",
  border:
    "1px solid var(--chris-border-soft)",
  background:
    "var(--chris-input-bg)",
  color:
    "var(--chris-text-main)",
  WebkitTextFillColor:
    "var(--chris-text-main)",
};

const sectionStackStyle = {
  display: "grid",
  gap: 12,
  marginTop: 20,
};

const workflowSectionStyle = {
  display: "grid",
  gridTemplateColumns:
    "38px 1fr",
  gap: 14,
  padding: 16,
  borderRadius:
    "var(--chris-radius-md)",
  border:
    "1px solid var(--chris-border-soft)",
  background:
    "rgba(255,255,255,.02)",
};

const sectionNumberStyle = {
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  borderRadius: 10,
  background:
    "rgba(212,175,55,.10)",
  color:
    "var(--chris-gold)",
  fontWeight: 900,
};

const sectionTitleStyle = {
  margin: 0,
  color:
    "var(--chris-text-main)",
  fontWeight: 900,
};

const sectionDescriptionStyle = {
  margin:
    "4px 0 10px",
  color:
    "var(--chris-text-secondary)",
  fontSize:
    "var(--chris-font-sm)",
};

const chipWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 7,
};

const chipStyle = {
  padding:
    "5px 8px",
  borderRadius:
    "var(--chris-radius-pill)",
  border:
    "1px solid rgba(212,175,55,.16)",
  color:
    "var(--chris-text-secondary)",
  fontSize:
    "var(--chris-font-xs)",
};

const componentListStyle = {
  display: "grid",
  gap: 10,
  margin:
    "18px 0",
};

const componentRowStyle = {
  display: "flex",
  gap: 9,
  alignItems:
    "center",
  color:
    "var(--chris-text-main)",
  fontWeight: 700,
};

const cardGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(250px,1fr))",
  gap: 16,
};

const workflowCardStyle = {
  borderRadius:
    "var(--chris-radius-card)",
  overflow: "hidden",
  border:
    "1px solid var(--chris-border-gold)",
  background:
    "linear-gradient(145deg,rgba(12,38,26,.94),rgba(7,18,13,.98))",
  boxShadow:
    "var(--chris-shadow-card)",
};

const workflowVisualStyle = {
  minHeight: 130,
  display: "grid",
  placeItems: "center",
  background:
    "radial-gradient(circle at 50% 30%,rgba(212,175,55,.18),transparent 50%),rgba(255,255,255,.018)",
  color:
    "var(--chris-gold)",
  fontSize: 45,
};

const workflowBodyStyle = {
  padding: 16,
};

const cardTitleStyle = {
  margin: 0,
  color:
    "var(--chris-text-main)",
  fontSize:
    "var(--chris-font-lg)",
  fontWeight: 900,
};

const cardFooterStyle = {
  display: "flex",
  justifyContent:
    "space-between",
  gap: 10,
  alignItems:
    "center",
  marginTop: 14,
};

const statusPillStyle = {
  display:
    "inline-flex",
  padding:
    "5px 8px",
  borderRadius:
    "var(--chris-radius-pill)",
  border:
    "1px solid rgba(212,175,55,.20)",
  background:
    "rgba(212,175,55,.06)",
  color:
    "var(--chris-gold)",
  fontSize:
    "var(--chris-font-xs)",
  fontWeight: 900,
};

const startPanelStyle = {
  ...builderMainStyle,
  marginBottom: 18,
};

const startGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(220px,1fr))",
  gap: 14,
  marginTop: 16,
  alignItems: "end",
};

const panelStyle = {
  ...builderMainStyle,
};

const panelHeaderStyle = {
  display: "flex",
  justifyContent:
    "space-between",
  gap: 14,
  alignItems:
    "flex-start",
  marginBottom: 16,
};

const panelTitleStyle = {
  margin: 0,
  color:
    "var(--chris-text-main)",
  fontSize:
    "var(--chris-font-xl)",
  fontWeight: 900,
};

const panelIconStyle = {
  color:
    "var(--chris-gold)",
  fontSize: 20,
};

const mutedStyle = {
  marginTop: 4,
  color:
    "var(--chris-text-secondary)",
  fontSize:
    "var(--chris-font-xs)",
};

const emptyStyle = {
  padding: 24,
  color:
    "var(--chris-text-secondary)",
  textAlign: "center",
};

const successStyle = {
  marginBottom: 15,
  padding:
    "11px 13px",
  borderRadius:
    "var(--chris-radius-md)",
  border:
    "1px solid rgba(46,233,139,.22)",
  background:
    "rgba(46,233,139,.05)",
  color:
    "var(--chris-green-bright)",
  fontWeight: 800,
};

const errorStyle = {
  marginBottom: 15,
  padding:
    "11px 13px",
  borderRadius:
    "var(--chris-radius-md)",
  border:
    "1px solid rgba(251,113,133,.25)",
  background:
    "rgba(251,113,133,.05)",
  color:
    "var(--chris-danger)",
  fontWeight: 800,
};

const statusCardGridStyle = {
  display: "grid",
  gap: 16,
};

const recordCardStyle = {
  padding: 18,
  borderRadius:
    "var(--chris-radius-card)",
  border:
    "1px solid var(--chris-border-soft)",
  background:
    "rgba(255,255,255,.018)",
};

const recordHeaderStyle = {
  display: "flex",
  justifyContent:
    "space-between",
  gap: 12,
  alignItems:
    "flex-start",
};

const progressBlockStyle = {
  display: "grid",
  gridTemplateColumns:
    "1fr 50px",
  gap: 12,
  alignItems: "center",
  marginTop: 14,
};

const recordMetaStyle = {
  display: "flex",
  justifyContent:
    "space-between",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 10,
  color:
    "var(--chris-text-secondary)",
  fontSize:
    "var(--chris-font-sm)",
};

const sectionButtonGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(170px,1fr))",
  gap: 10,
  marginTop: 16,
};

const sectionButtonStyle = {
  display: "grid",
  gridTemplateColumns:
    "26px 1fr",
  gap: 8,
  alignItems: "center",
  textAlign: "left",
  padding: 12,
  borderRadius:
    "var(--chris-radius-md)",
  border:
    "1px solid var(--chris-border-soft)",
  background:
    "rgba(255,255,255,.025)",
  color:
    "var(--chris-text-main)",
  cursor: "pointer",
};

const activeEditingSectionStyle = {
  border:
    "2px solid var(--chris-gold)",
  background:
    "rgba(212,175,55,.12)",
  boxShadow:
    "0 0 0 2px rgba(212,175,55,.08), 0 10px 24px rgba(0,0,0,.16)",
  transform:
    "translateY(-1px)",
};
const inProgressSectionStyle = {
  border:
    "1px solid rgba(212,175,55,.50)",
  background:
    "rgba(212,175,55,.07)",
};

const completedSectionStyle = {
  border:
    "1px solid rgba(46,233,139,.40)",
  background:
    "rgba(46,233,139,.07)",
  color:
    "var(--chris-green-bright)",
};

const editorErrorStyle = {
  marginBottom: 14,
  padding: "11px 13px",
  borderRadius:
    "var(--chris-radius-md)",
  border:
    "1px solid rgba(251,113,133,.28)",
  background:
    "rgba(251,113,133,.07)",
  color:
    "var(--chris-danger)",
  fontWeight: 800,
};

const editorSuccessStyle = {
  marginBottom: 14,
  padding: "11px 13px",
  borderRadius:
    "var(--chris-radius-md)",
  border:
    "1px solid rgba(46,233,139,.24)",
  background:
    "rgba(46,233,139,.06)",
  color:
    "var(--chris-green-bright)",
  fontWeight: 800,
};
const editorPanelStyle = {
  ...builderMainStyle,
  marginTop: 18,
};

const countryFlagStyle = {
  width: 26,
  height: 18,
  objectFit: "cover",
  borderRadius: 3,
  flex: "0 0 auto",
  boxShadow:
    "0 0 0 1px rgba(255,255,255,.12)",
};

const flagDialControlStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  minWidth: 0,
  paddingLeft: 10,
  border:
    "1px solid var(--chris-border)",
  borderRadius:
    "var(--chris-radius-md)",
  background:
    "var(--chris-input-bg)",
};

const flagCountryControlStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  paddingLeft: 10,
  border:
    "1px solid var(--chris-border)",
  borderRadius:
    "var(--chris-radius-md)",
  background:
    "var(--chris-input-bg)",
};

const dialCodeSelectStyle = {
  ...inputStyle,
  flex: 1,
  minWidth: 0,
  border: "none",
  background: "transparent",
  paddingLeft: 0,
  paddingRight: 24,
};

const countryNameSelectStyle = {
  ...inputStyle,
  flex: 1,
  minWidth: 0,
  border: "none",
  background: "transparent",
  paddingLeft: 0,
};
const countryFieldGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "minmax(0,1.2fr) minmax(0,.8fr)",
  gap: 8,
};

const phoneFieldGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "145px minmax(0,1fr)",
  gap: 8,
};
const personalFormGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(240px,1fr))",
  gap: 14,
};

const readOnlyInputStyle = {
  ...inputStyle,
  opacity: 0.75,
  cursor: "not-allowed",
};

const textareaStyle = {
  ...inputStyle,
  minHeight: 88,
  resize: "vertical",
};

const dataIntegrityNoteStyle = {
  marginTop: 16,
  padding: 12,
  borderRadius:
    "var(--chris-radius-md)",
  border:
    "1px solid rgba(212,175,55,.20)",
  background:
    "rgba(212,175,55,.05)",
  color:
    "var(--chris-text-secondary)",
  fontSize:
    "var(--chris-font-sm)",
  lineHeight: 1.5,
};
const checklistStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(240px,1fr))",
  gap: 10,
};

const checklistItemStyle = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  padding: 12,
  borderRadius:
    "var(--chris-radius-md)",
  border:
    "1px solid var(--chris-border-soft)",
  background:
    "rgba(255,255,255,.02)",
  color:
    "var(--chris-text-main)",
  fontWeight: 700,
};

const editorFooterStyle = {
  display: "flex",
  justifyContent:
    "space-between",
  gap: 12,
  alignItems: "center",
  marginTop: 16,
};

export default EmployeeOnboarding;
