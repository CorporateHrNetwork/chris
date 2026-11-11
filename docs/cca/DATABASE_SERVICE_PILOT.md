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

To include the CHRiS login smoke test, install the backend dependencies with
`npm ci` in `backend`, then run:

```sh
bash tools/cca-local-demo/rehearseDatabaseService.sh --with-chris
```

This applies the repository's Prisma migrations to the empty CHRiS test
database, creates a fictional organization and user, and exercises the existing
CHRiS login route using a restricted database role. The check signs in after
Cedar is suspended and rejects the same credentials for an unknown organization.
It verifies the authentication path with a local HTTP server.

The script creates a new password-protected cluster on loopback port 55432 and fictional records. It
removes the test cluster and artifacts when it finishes. CCA has no live
provisioning endpoint and the script never reads a CHRiS connection string.
The restore check covers one database archive within the test cluster. Before
commercial launch, verify off-host backups and complete recovery on an
independent server, including roles and access grants.

## Persistent Windows staging and off-host recovery

Use a Windows account with PostgreSQL client and server tools on PATH. Run
the PowerShell script as that account:

```powershell
.\Start-DatabaseStaging.ps1 -Action Start
.\Start-DatabaseStaging.ps1 -Action Verify
```

The pilot binds to loopback port 55434, stores credentials in an account-private
password file, and keeps its fictional data under
`%LOCALAPPDATA%\CRNETWORK-CCA-Database-Staging`. Use `-Action Stop` to stop
the test cluster and `-Action Start` to reopen it. Startup after a machine
reboot is manual. This database contains only the fictional pilot records.

Generate a recovery key and certificate on the separate recovery host. Keep
the private key there. Copy only the public certificate to Windows and use
`-Action Backup -RecoveryCertificate <path>` to make an encrypted archive
using OpenSSL. Transfer the encrypted archive to the recovery host and run:

```sh
bash tools/cca-local-demo/verifyOffHostRecovery.sh archive.cms cert.pem key.pem
```

Recovery uses an independent loopback PostgreSQL cluster on port 55435.
The rehearsal provisions a fresh CHRiS application credential and verifies
that it can read the restored fictional record. Scheduled off-site backups
and recovery for a complete CHRiS staging dataset are follow-up milestones.
