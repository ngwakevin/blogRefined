import type { EvidenceSignal, ScratchpadVariable } from "@/lib/redefined";

export function hasComparableEvidence(input: string): boolean {
  const value = input.toLowerCase();

  return [
    /expected\s+(?:value\s+)?[:=].+actual\s+(?:value\s+)?[:=]/i,
    /actual\s+(?:value\s+)?[:=].+expected\s+(?:value\s+)?[:=]/i,
    /configured\s+(?:value\s+)?[:=].+observed\s+(?:value\s+)?[:=]/i,
    /observed\s+(?:value\s+)?[:=].+configured\s+(?:value\s+)?[:=]/i,
    /source\s+(?:value|server|host|endpoint)?\s*[:=].+gateway\s+(?:value|server|host|endpoint)?\s*[:=]/i,
    /local\s+(?:value|server|host|endpoint)?\s*[:=].+cloud\s+(?:value|server|host|endpoint)?\s*[:=]/i,
    /server\s+name\s+mismatch/i,
    /datasource\s+mismatch/i,
    /data\s+source\s+mismatch/i,
    /environment\s+mismatch/i,
    /different\s+endpoint/i,
    /different\s+account\s+names?/i,
    /\b[\w.-]+\s*!=\s*[\w.-]+\b/i
  ].some((pattern) => pattern.test(value));
}

export function parseEvidenceSignals(input: string): EvidenceSignal[] {
  const value = input.toLowerCase();
  const signals: EvidenceSignal[] = [];
  const fqdns = [...new Set(input.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi) ?? [])];

  fqdns.forEach((fqdn, index) => {
    signals.push({
      id: `fqdn-${index}`,
      label: "FQDN detected",
      severity: "info",
      matchedText: fqdn,
      meaning: "A hostname or service endpoint was detected.",
      affectedNodeId: "target",
      confidence: 0.62
    });
  });

  if (
    value.includes("authorizationpermissionmismatch") ||
    value.includes("authorizationfailure") ||
    value.includes("this request is not authorized") ||
    value.includes("no role assignment") ||
    value.includes("role assignment list returned no assignments") ||
    value.includes("returned no assignments") ||
    value.includes("no assignments") ||
    value.includes("role assignment not found") ||
    value.includes("not authorized to perform this operation") ||
    value.includes("lacks permission") ||
    value.includes("403 authorization")
  ) {
    signals.push({
      id: "rbac-permission-denied",
      label: "Permission role assignment missing",
      severity: "critical",
      matchedText: input.match(/AuthorizationPermissionMismatch|AuthorizationFailure|This request is not authorized|not authorized to perform this operation|role assignment list returned no assignments|returned no assignments|no role assignment|no assignments|role assignment not found|lacks permission|403 authorization/i)?.[0] ?? "role assignment missing",
      meaning: "The caller likely lacks the required Storage Blob Data role or scope.",
      affectedNodeId: "rbac-role",
      affectedBranchId: "rbac",
      confidence: 0.96
    });
  }

  if (
    value.includes("ipaddressnotallowed") ||
    value.includes("firewall") ||
    value.includes("networkacls") ||
    value.includes("publicnetworkaccess") ||
    value.includes("public network access disabled") ||
    value.includes("publicnetworkaccess disabled") ||
    value.includes("client ip is not allowed") ||
    value.includes("connection timed out") ||
    value.includes("private endpoint") ||
    value.includes("vnet") ||
    /\bdns\b/.test(value)
  ) {
    signals.push({
      id: "storage-network-denied",
      label: "Network branch",
      severity: "critical",
      matchedText: input.match(/IpAddressNotAllowed|firewall|networkAcls|publicNetworkAccess disabled|connection timed out|private endpoint|VNet/i)?.[0] ?? "Network restriction evidence",
      meaning: "The storage firewall, selected networks, or private endpoint path may be blocking access.",
      affectedNodeId: "network-rule",
      affectedBranchId: "network",
      confidence: 0.78
    });
  }

  if (
    value.includes("authenticationfailed") ||
    value.includes("signature did not match") ||
    value.includes("sas token") ||
    value.includes("shared access signature") ||
    value.includes("sas") ||
    value.includes("expired") ||
    value.includes("token expired") ||
    value.includes("start time") ||
    value.includes("expiry time") ||
    value.includes("expiry") ||
    value.includes("allowed ip") ||
    value.includes("https only") ||
    value.includes("https-only")
  ) {
    signals.push({
      id: "sas-auth-failed",
      label: "SAS/Auth branch",
      severity: "critical",
      matchedText: input.match(/AuthenticationFailed|Signature did not match|SAS|expired|token expired|start time|expiry time/i)?.[0] ?? "SAS/Auth evidence",
      meaning: "A token, SAS time window, permissions, allowed IP, or protocol constraint may be invalid.",
      affectedNodeId: "identity",
      affectedBranchId: "sas",
      confidence: 0.9
    });
  }

  if (/\b403\b/.test(value) || value.includes("access denied")) {
    signals.push({
      id: "access-denied-response",
      label: "Access denied response",
      severity: "critical",
      matchedText: "403 / access denied",
      meaning: "The request reached an authorization or policy boundary that denied access.",
      affectedNodeId: "access-denied",
      affectedBranchId: "rbac",
      confidence: 0.84
    });
  }

  if (
    value.includes("privatelink") ||
    (value.includes("public ip") && value.includes("private")) ||
    value.includes("resolves to public")
  ) {
    signals.push({
      id: "private-dns-mismatch",
      label: "Private endpoint DNS mismatch",
      severity: "warning",
      matchedText: "privatelink / public IP mismatch",
      meaning: "DNS may be resolving to a public endpoint when private endpoint routing is expected.",
      affectedNodeId: "network-rule",
      affectedBranchId: "network",
      confidence: 0.86
    });
  }

  if (
    value.includes("principal valid") ||
    value.includes("signed in user") ||
    value.includes("token valid")
  ) {
    signals.push({
      id: "identity-valid",
      label: "Identity signal",
      severity: "success",
      matchedText: input.match(/principal valid|signed in user|token valid/i)?.[0] ?? "Identity valid",
      meaning: "Identity evidence appears valid, so the next likely branch is authorization scope or policy.",
      affectedNodeId: "identity",
      affectedBranchId: "rbac",
      confidence: 0.88
    });
  }

  if (
    value.includes("tcptestsucceeded : false") ||
    value.includes("test-netconnection fails") ||
    value.includes("tcp fails") ||
    value.includes("timeout")
  ) {
    signals.push({
      id: "tcp-failed",
      label: "TCP reachability failed",
      severity: "critical",
      matchedText: "TCP / port reachability failure",
      meaning: "The affected host may not be able to reach the target over the required port.",
      affectedNodeId: "network",
      affectedBranchId: "network",
      confidence: 0.78
    });
  }

  if (
    value.includes("nslookup works") ||
    value.includes("non-authoritative answer") ||
    value.includes("name:")
  ) {
    signals.push({
      id: "dns-healthy",
      label: "DNS appears healthy",
      severity: "success",
      matchedText: "DNS resolution evidence",
      meaning: "Name resolution appears to be working based on the pasted evidence.",
      affectedNodeId: "resolution",
      affectedBranchId: "network",
      confidence: 0.74
    });
  }

  if (value.includes("401") || value.includes("unauthorized") || value.includes("login failed")) {
    signals.push({
      id: "auth-failed",
      label: "Authentication failure",
      severity: "critical",
      matchedText: "401 / unauthorized / login failed",
      meaning: "The request may be reaching the target but failing during authentication.",
      affectedNodeId: "target",
      affectedBranchId: "sas",
      confidence: 0.82
    });
  }

  if (hasComparableEvidence(input)) {
    signals.push({
      id: "config-mismatch",
      label: "Configuration mismatch",
      severity: "warning",
      matchedText: "configuration mismatch",
      meaning: "Two environment values appear different and may need comparison.",
      affectedNodeId: "target",
      confidence: 0.7
    });
  }

  if (value.includes("1433")) {
    signals.push({
      id: "port-1433",
      label: "Port detected",
      severity: "info",
      matchedText: "1433",
      meaning: "SQL Server / SQL MI port detected.",
      affectedNodeId: "network",
      affectedBranchId: "network",
      confidence: 0.62
    });
  }

  return signals;
}

export function extractScratchpadFromEvidence(input: string): ScratchpadVariable[] {
  const variables: ScratchpadVariable[] = [];
  const fqdns = [...new Set(input.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi) ?? [])];

  fqdns.forEach((fqdn, index) => {
    variables.push({
      id: `evidence-fqdn-${index}-${fqdn}`,
      label: "detected_fqdn",
      value: fqdn,
      source: "evidence"
    });
  });

  if (input.includes("1433")) {
    variables.push({
      id: "evidence-port-1433",
      label: "detected_port",
      value: "1433",
      source: "evidence"
    });
  }

  return variables;
}
