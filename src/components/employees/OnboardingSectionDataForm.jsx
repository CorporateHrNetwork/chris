import {
  useEffect,
  useState,
} from "react";

import {
  apiRequest,
} from "../../services/api";

import {
  COUNTRY_CATALOG,
} from "../../data/countryCatalog";

const SECTION_CONFIG = {
  "statutory-details": {
    fields: [
      { name: "taxIdentificationNumber", label: "Tax Identification Number (TIN)", type: "text" },
      { name: "payeState", label: "PAYE State / Tax Authority", type: "text" },
      { name: "pensionPfa", label: "Pension Fund Administrator (PFA)", type: "text" },
      { name: "pensionPin", label: "Retirement Savings Account (RSA) PIN", type: "text" },
      { name: "nhiaNumber", label: "NHIA / Health Insurance Number", type: "text" },
      { name: "otherStatutoryStatus", label: "Other Statutory Requirements", type: "select", options: ["Completed", "Not Applicable", "Pending"] },
      { name: "otherStatutoryNotes", label: "Other Statutory Notes", type: "textarea" },
    ],
  },
  "next-of-kin": {
    fields: [
      { name: "name", label: "Next of Kin Name", type: "text" },
      { name: "relationship", label: "Relationship", type: "text" },
      { name: "phoneCountryCode", label: "Phone Country", type: "country-phone" },
      { name: "phoneNumber", label: "Phone Number", type: "text" },
      { name: "address", label: "Residential Address", type: "textarea" },
    ],
  },
  "emergency-contact": {
    fields: [
      { name: "name", label: "Emergency Contact Name", type: "text" },
      { name: "relationship", label: "Relationship", type: "text" },
      { name: "phoneCountryCode", label: "Phone Country", type: "country-phone" },
      { name: "phoneNumber", label: "Phone Number", type: "text" },
      { name: "alternativePhoneCountryCode", label: "Alternative Phone Country", type: "country-phone" },
      { name: "alternativePhone", label: "Alternative Phone", type: "text" },
    ],
  },
  "legal": {
    fields: [
      { name: "employmentContractStatus", label: "Employment Contract", type: "select", options: ["Completed", "Pending", "Not Applicable"] },
      { name: "ndaStatus", label: "Confidentiality / NDA", type: "select", options: ["Completed", "Pending", "Not Applicable"] },
      { name: "policyAcknowledgementStatus", label: "Policy Acknowledgements", type: "select", options: ["Completed", "Pending", "Not Applicable"] },
      { name: "dataPrivacyConsentStatus", label: "Data Privacy Consent", type: "select", options: ["Completed", "Pending", "Not Applicable"] },
      { name: "legalNotes", label: "Legal Notes", type: "textarea" },
    ],
  },
  "assets": {
    fields: [
      { name: "laptopComputer", label: "Laptop / Computer", type: "text" },
      { name: "phoneAsset", label: "Phone", type: "text" },
      { name: "accessCard", label: "ID / Access Card", type: "text" },
      { name: "ppe", label: "PPE", type: "text" },
      { name: "otherAssets", label: "Other Assigned Assets", type: "textarea" },
    ],
  },
};

const FALLBACK_NIGERIA_BANKS = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank", code: "214" },
  { name: "Globus Bank", code: "00103" },
  { name: "Guaranty Trust Bank", code: "058" },
  { name: "Jaiz Bank", code: "301" },
  { name: "Keystone Bank", code: "082" },
  { name: "Lotus Bank", code: "303" },
  { name: "Optimus Bank", code: "107" },
  { name: "Parallex Bank", code: "104" },
  { name: "Polaris Bank", code: "076" },
  { name: "PremiumTrust Bank", code: "105" },
  { name: "Providus Bank", code: "101" },
  { name: "Signature Bank", code: "106" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered Bank", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "SunTrust Bank", code: "100" },
  { name: "TAJBank", code: "302" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank for Africa", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
];

function normalizeSectionKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-");
}

function flagPath(code) {
  return `/flags/${String(
    code || "NG"
  )
    .trim()
    .toLowerCase()}.png`;
}

function CountryPhoneControl({
  value,
  onChange,
  inputStyle,
}) {
  const selected =
    COUNTRY_CATALOG.find(
      (country) =>
        country.code ===
        (value || "NG")
    ) ||
    COUNTRY_CATALOG[0];

  return (
    <div style={countryControlStyle}>
      <img
        src={flagPath(
          selected?.code || "NG"
        )}
        alt=""
        aria-hidden="true"
        style={flagStyle}
      />

      <select
        value={value || "NG"}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        style={{
          ...inputStyle,
          border: "none",
          background: "transparent",
          paddingLeft: 0,
        }}
      >
        {COUNTRY_CATALOG.map(
          (country) => (
            <option
              key={country.code}
              value={country.code}
            >
              {country.dialCode} - {country.name}
            </option>
          )
        )}
      </select>
    </div>
  );
}

function PaymentDetailsForm({
  value,
  onChange,
  inputStyle,
}) {
  const data = value || {};
  const [banks, setBanks] =
    useState(
      FALLBACK_NIGERIA_BANKS
    );
  const [resolving, setResolving] =
    useState(false);
  const [resolveMessage, setResolveMessage] =
    useState("");

  useEffect(() => {
    let active = true;

    apiRequest(
      "/api/employees/onboarding/payment/banks"
    )
      .then((result) => {
        if (
          active &&
          Array.isArray(
            result?.data
          ) &&
          result.data.length
        ) {
          setBanks(
            result.data
          );
        }
      })
      .catch(() => {
        // Keep local fallback bank list.
      });

    return () => {
      active = false;
    };
  }, []);

  function setField(
    name,
    nextValue
  ) {
    onChange({
      ...data,
      [name]: nextValue,
    });
  }

  async function resolveAccount({
    bankCode,
    accountNumber,
  }) {
    const cleanNumber =
      String(
        accountNumber || ""
      ).replace(/\D/g, "");

    if (
      !bankCode ||
      cleanNumber.length !== 10
    ) {
      return;
    }

    setResolving(true);
    setResolveMessage("");

    try {
      const result =
        await apiRequest(
          "/api/employees/onboarding/payment/resolve-account",
          {
            method: "POST",
            body: {
              bankCode,
              accountNumber:
                cleanNumber,
            },
          }
        );

      const accountName =
        result?.data?.accountName ||
        "";

      onChange({
        ...data,
        bankCode,
        accountNumber:
          cleanNumber,
        accountName,
      });

      setResolveMessage(
        accountName
          ? "Account name verified."
          : "Account name could not be resolved."
      );
    } catch (error) {
      onChange({
        ...data,
        bankCode,
        accountNumber:
          cleanNumber,
        accountName: "",
      });

      setResolveMessage(
        error?.message ||
          "Unable to verify account name."
      );
    } finally {
      setResolving(false);
    }
  }

  function handleBankChange(
    event
  ) {
    const bankCode =
      event.target.value;

    const bank =
      banks.find(
        (item) =>
          String(item.code) ===
          String(bankCode)
      );

    const next = {
      ...data,
      bankCode,
      bankName:
        bank?.name || "",
      accountName: "",
    };

    onChange(next);

    resolveAccount({
      bankCode,
      accountNumber:
        data.accountNumber,
    });
  }

  function handleAccountNumberChange(
    event
  ) {
    const accountNumber =
      event.target.value
        .replace(/\D/g, "")
        .slice(0, 10);

    onChange({
      ...data,
      accountNumber,
      accountName: "",
    });

    if (
      accountNumber.length === 10 &&
      data.bankCode
    ) {
      resolveAccount({
        bankCode:
          data.bankCode,
        accountNumber,
      });
    }
  }

  return (
    <div style={gridStyle}>
      <label style={fieldStyle}>
        <span style={labelStyle}>
          Bank Name
        </span>

        <select
          value={
            data.bankCode || ""
          }
          onChange={
            handleBankChange
          }
          style={inputStyle}
        >
          <option value="">
            Select bank
          </option>

          {banks.map(
            (bank) => (
              <option
                key={`${bank.code}-${bank.name}`}
                value={
                  bank.code
                }
              >
                {bank.name}
              </option>
            )
          )}
        </select>
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>
          Account Number
        </span>

        <input
          inputMode="numeric"
          maxLength="10"
          value={
            data.accountNumber || ""
          }
          onChange={
            handleAccountNumberChange
          }
          style={inputStyle}
          placeholder="10-digit account number"
        />

        <small style={hintStyle}>
          Select the bank and enter the 10-digit account number.
          CHRIS will verify the account name automatically.
        </small>
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>
          Account Name
        </span>

        <input
          value={
            resolving
              ? "Verifying account..."
              : data.accountName || ""
          }
          readOnly
          style={{
            ...inputStyle,
            opacity:
              resolving
                ? 0.8
                : 1,
          }}
          placeholder="Populated after verification"
        />

        {resolveMessage ? (
          <small style={hintStyle}>
            {resolveMessage}
          </small>
        ) : null}
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>
          Payroll Currency
        </span>

        <select
          value={
            data.payrollCurrency ||
            ""
          }
          onChange={(event) =>
            setField(
              "payrollCurrency",
              event.target.value
            )
          }
          style={inputStyle}
        >
          <option value="">
            Select currency
          </option>
          <option value="NGN">
            NGN - Nigerian Naira
          </option>
          <option value="USD">
            USD - US Dollar
          </option>
          <option value="GBP">
            GBP - Pound Sterling
          </option>
          <option value="EUR">
            EUR - Euro
          </option>
          <option value="GHS">
            GHS - Ghana Cedi
          </option>
          <option value="ZAR">
            ZAR - South African Rand
          </option>
          <option value="KES">
            KES - Kenyan Shilling
          </option>
        </select>
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>
          Payment Method
        </span>

        <select
          value={
            data.paymentMethod ||
            ""
          }
          onChange={(event) =>
            setField(
              "paymentMethod",
              event.target.value
            )
          }
          style={inputStyle}
        >
          <option value="">
            Select payment method
          </option>
          <option value="Bank Transfer">
            Bank Transfer
          </option>
          <option value="Cash">
            Cash
          </option>
          <option value="Cheque">
            Cheque
          </option>
          <option value="Mobile Money">
            Mobile Money
          </option>
          <option value="Other">
            Other
          </option>
        </select>
      </label>
    </div>
  );
}

export default function OnboardingSectionDataForm({
  sectionKey,
  value,
  onChange,
  inputStyle,
  textareaStyle,
}) {
  const resolvedKey =
    normalizeSectionKey(
      sectionKey
    );

  if (
    resolvedKey ===
    "payment-details"
  ) {
    return (
      <PaymentDetailsForm
        value={value}
        onChange={onChange}
        inputStyle={inputStyle}
      />
    );
  }

  const config =
    SECTION_CONFIG[
      resolvedKey
    ];

  const data =
    value || {};

  if (!config) {
    return (
      <div style={unsupportedStyle}>
        This onboarding section does not yet have a mapped data form.
        Section key: {String(sectionKey || "(blank)")}
      </div>
    );
  }

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
    <div style={gridStyle}>
      {config.fields.map(
        (field) => {
          if (
            field.type ===
            "textarea"
          ) {
            return (
              <label
                key={field.name}
                style={fieldStyle}
              >
                <span style={labelStyle}>
                  {field.label}
                </span>
                <textarea
                  value={
                    data[field.name] ||
                    ""
                  }
                  onChange={(event) =>
                    setField(
                      field.name,
                      event.target.value
                    )
                  }
                  rows="3"
                  style={textareaStyle}
                />
              </label>
            );
          }

          if (
            field.type ===
            "select"
          ) {
            return (
              <label
                key={field.name}
                style={fieldStyle}
              >
                <span style={labelStyle}>
                  {field.label}
                </span>
                <select
                  value={
                    data[field.name] ||
                    ""
                  }
                  onChange={(event) =>
                    setField(
                      field.name,
                      event.target.value
                    )
                  }
                  style={inputStyle}
                >
                  <option value="">
                    Select option
                  </option>
                  {field.options.map(
                    (option) => (
                      <option
                        key={option}
                        value={option}
                      >
                        {option}
                      </option>
                    )
                  )}
                </select>
              </label>
            );
          }

          if (
            field.type ===
            "country-phone"
          ) {
            return (
              <label
                key={field.name}
                style={fieldStyle}
              >
                <span style={labelStyle}>
                  {field.label}
                </span>
                <CountryPhoneControl
                  value={
                    data[field.name] ||
                    "NG"
                  }
                  onChange={(nextValue) =>
                    setField(
                      field.name,
                      nextValue
                    )
                  }
                  inputStyle={
                    inputStyle
                  }
                />
              </label>
            );
          }

          return (
            <label
              key={field.name}
              style={fieldStyle}
            >
              <span style={labelStyle}>
                {field.label}
              </span>
              <input
                value={
                  data[field.name] ||
                  ""
                }
                onChange={(event) =>
                  setField(
                    field.name,
                    event.target.value
                  )
                }
                style={inputStyle}
              />
            </label>
          );
        }
      )}
    </div>
  );
}

const gridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(240px,1fr))",
  gap: 14,
};

const fieldStyle = {
  display: "grid",
  gap: 7,
};

const labelStyle = {
  color:
    "var(--chris-text-secondary)",
  fontSize:
    "var(--chris-font-sm)",
  fontWeight: 800,
};

const hintStyle = {
  color:
    "var(--chris-text-secondary)",
  fontSize:
    "var(--chris-font-xs)",
  lineHeight: 1.45,
};

const countryControlStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  paddingLeft: 10,
  border:
    "1px solid var(--chris-border)",
  borderRadius:
    "var(--chris-radius-md)",
  background:
    "var(--chris-input-bg)",
};

const flagStyle = {
  width: 26,
  height: 18,
  objectFit: "cover",
  borderRadius: 3,
  flex: "0 0 auto",
};

const unsupportedStyle = {
  padding: 14,
  border:
    "1px solid var(--chris-border-gold)",
  borderRadius:
    "var(--chris-radius-md)",
  background:
    "rgba(212,175,55,.05)",
  color:
    "var(--chris-text-main)",
};
