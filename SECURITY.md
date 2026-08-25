# Security policy

Please report vulnerabilities privately through GitHub's security advisory
workflow for this repository. Do not include production credentials, request
headers, customer data, or private application storage in a public issue.

## Data boundary

Mobile Diagnostics Kit is designed for internal builds:

- the React Native entry is disabled unless the host explicitly enables it;
- the MMKV allow-list is empty by default and does not support wildcards;
- credential-like fields are recursively redacted and cannot be edited;
- the library has no service, account, analytics SDK, or upload endpoint;
- Android DoKit telemetry is disabled through `disableUpload()`;
- iOS DoKit telemetry collection is disabled before DoKit is installed;
- Expo update results expose stable status codes and normalized current-bundle
  identifiers, not manifests or URLs.

Applications are still responsible for excluding this dependency and its
build switches from store configurations.
