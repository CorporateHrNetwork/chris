# CCA automatic support routing

The isolated staging Service Desk accepts a fictional Cedar request from an
authorized support session. The server supplies the fictional requester and
tenant. Intake verification runs before CCA creates the case. The Intake
Analysis Agent then classifies the request and records the classification
and assignment in the case history. No dispatcher selects an agent.

The local classifier is deterministic and uses English-language routing rules
for payroll, HR, billing, technical support and customer success. Requests
with competing signals or insufficient detail go to the Intake Clarification
Agent and show a suggested question. Case creation and assignment are saved
together before the server acknowledges receipt. The same request identifier
returns the existing case. Pending cases in older fictional snapshots are
routed automatically when the snapshot is loaded.

Assigned cases get a specialist draft from category-specific templates.
CCA saves the draft with the case and displays it for human review. A case
that needs clarification displays its follow-up question. Previously assigned
cases with a supported route get a draft when their saved state is loaded.
Drafts remain internal. The existing synthetic workflow
still requires separate approval before resolution and requester confirmation
before closure. Live portal, email and WhatsApp connectors are outside this
stage.
