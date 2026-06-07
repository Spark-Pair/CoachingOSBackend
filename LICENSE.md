# Offline License Management

The installed application verifies signed license files using the public key in
`src/config/licensePublicKey.js`. The private key must remain only on the
developer machine.

## One-Time Key Setup

```powershell
npm run license:keys
```

The private key is stored outside the repository:

```text
%USERPROFILE%\.coachingos-license-keys\private.pem
```

Back up that directory securely. Losing the private key means existing
installations can still run, but no compatible renewal licenses can be issued.

## Create a License

```powershell
npm run license:create -- --customer "Iqbal Coaching" --expires 2027-06-07
```

Generated licenses are written outside the repository to:

```text
%USERPROFILE%\CoachingOS-Licenses
```

## Install or Renew a License

Run this on the customer machine:

```powershell
npm run license:install -- "C:\path\iqbal-coaching-2027-06-07.license.json"
```

The license is installed at:

```text
C:\ProgramData\CoachingOS\license.json
```

Database resets and application reinstalls do not change this file. Set
`COACHINGOS_LICENSE_DIR` only when packaging for another operating system or a
custom persistent location.

Never ship the private key or developer key directory with the application.
