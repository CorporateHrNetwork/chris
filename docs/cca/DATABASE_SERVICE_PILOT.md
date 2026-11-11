# CRNETWORK managed database pilot

CCA handles the service request. PostgreSQL runs independently and applications
connect directly using their own credentials. CHRiS has a dedicated database
with lifetime access at ₦0 under the CRNETWORK service policy. Commercial client
entitlements and invoicing are handled manually in this pilot.

## Rehearse with fictional data

1. In the CCA local or authenticated staging Service Desk, submit a Cedar
   request such as “Please provision a PostgreSQL database for our staging
   application.” Confirm the case routes to Database Services. Review the
   proposed response through the existing CCA workflow.
2. As the pilot operator, run the following on Linux or WSL as an unprivileged
   user, with PostgreSQL server and client binaries, and OpenSSL on PATH.

   ```sh
   bash tools/cca-local-demo/rehearseDatabaseService.sh
   ```

3. Verify the three reported checks cover database isolation, Cedar suspension,
   and CHRiS backup restoration.

The script creates a new password-protected cluster on loopback port 55432 and fictional records. It
removes the test cluster and artifacts when it finishes. CCA has no live
provisioning endpoint and the script never reads a CHRiS connection string.
The restore check covers one database archive within the test cluster. Before
commercial launch, verify off-host backups and complete recovery on an
independent server, including roles and access grants.
