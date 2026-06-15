import type {
  DiagnosticTerminal,
  FailureBranch,
  FixWorkspaceResult,
  QuickTest
} from "@/types/redefined";
import { inferCausalGraphFromPrompt } from "@/lib/normalize-ai-result";

function isAzureStorageAccessDeniedPrompt(prompt: string): boolean {
  const value = prompt.toLowerCase();
  return (
    /(storage|storage account|blob|container|adls)/.test(value) &&
    /(access denied|403|not authorized|authorization|authentication failed)/.test(value)
  );
}

function branchText(branches: FailureBranch[]): string {
  return branches
    .map((branch) => `${branch.title} ${branch.summary} ${branch.signals.join(" ")} ${branch.checks.join(" ")}`)
    .join(" ")
    .toLowerCase();
}

function quickTestText(tests: QuickTest[]): string {
  return tests
    .map((test) => `${test.title} ${test.purpose} ${test.commands.join(" ")}`)
    .join(" ")
    .toLowerCase();
}

function appendIfMissing<T>(items: T[], exists: boolean, item: T): T[] {
  return exists ? items : [...items, item];
}

function azureStorageFailureBranches(): FailureBranch[] {
  return [
    {
      id: "missing-rbac-data-plane-permission",
      title: "Missing RBAC/data-plane permission",
      summary: "The caller may have management access but not blob/file data access.",
      signals: [
        "AuthorizationPermissionMismatch",
        "This request is not authorized to perform this operation",
        "Can see the storage account but cannot open containers or blobs"
      ],
      checks: [
        "Confirm Storage Blob Data Reader, Contributor, or Owner role",
        "Confirm role scope: storage account, container, resource group, or subscription",
        "Re-authenticate after role assignment propagation"
      ],
      priority: "high"
    },
    {
      id: "storage-firewall-network-restriction",
      title: "Storage firewall or network restriction",
      summary: "The storage account may allow only selected networks, private endpoints, or trusted paths.",
      signals: [
        "IpAddressNotAllowed",
        "Works from one network but not another",
        "Public network access disabled"
      ],
      checks: [
        "Check storage account Networking settings",
        "Confirm client public IP or VNet is allowed",
        "Confirm private endpoint approval and route path"
      ],
      priority: "high"
    },
    {
      id: "private-endpoint-dns-mismatch",
      title: "Private endpoint or DNS mismatch",
      summary: "Traffic expected to use private endpoint may be resolving to the public endpoint.",
      signals: [
        "Private endpoint is configured",
        "Access should come from VNet, VPN, or ExpressRoute",
        "DNS resolves to public endpoint"
      ],
      checks: [
        "nslookup <storage-account-name>.blob.core.windows.net",
        "nslookup <storage-account-name>.dfs.core.windows.net",
        "Validate privatelink.blob.core.windows.net private DNS zone",
        "Validate privatelink.dfs.core.windows.net for ADLS Gen2"
      ],
      priority: "medium"
    },
    {
      id: "sas-token-issue",
      title: "SAS token issue",
      summary: "SAS may be expired, scoped incorrectly, IP-restricted, or missing required permissions.",
      signals: [
        "AuthenticationFailed",
        "SAS token used",
        "Request works with another identity but not SAS"
      ],
      checks: [
        "Confirm SAS start and expiry time",
        "Confirm permissions r, w, l, c, d as needed",
        "Confirm allowed IP and HTTPS-only settings",
        "Check clock/timezone skew"
      ],
      priority: "medium"
    }
  ];
}

function azureStorageQuickTests(): QuickTest[] {
  return [
    {
      id: "check-storage-rbac",
      title: "Check data-plane RBAC role",
      purpose: "Confirm the caller has a Storage Blob Data role at the correct scope.",
      commands: [
        "az role assignment list --assignee <principal-id> --scope <storage-scope> -o table"
      ],
      successSignal: "Caller has Storage Blob Data Reader, Contributor, or Owner at the required scope.",
      failureMeaning: "The caller may have management access but lacks data-plane permission.",
      category: "auth"
    },
    {
      id: "check-storage-network",
      title: "Check storage firewall and network rules",
      purpose: "Confirm the storage account allows access from the client network or private endpoint path.",
      commands: [
        "az storage account show --name <storage-account-name> --resource-group <resource-group> --query \"{publicNetworkAccess:publicNetworkAccess, defaultAction:networkRuleSet.defaultAction, bypass:networkRuleSet.bypass}\""
      ],
      successSignal: "Network rules allow the client path or private endpoint path.",
      failureMeaning: "Access may be blocked by firewall, selected networks, or public network access settings.",
      category: "network"
    },
    {
      id: "check-storage-private-dns",
      title: "Check private endpoint DNS",
      purpose: "Confirm blob/dfs endpoints resolve correctly when private endpoint access is expected.",
      commands: [
        "nslookup <storage-account-name>.blob.core.windows.net",
        "nslookup <storage-account-name>.dfs.core.windows.net"
      ],
      successSignal: "Private endpoint access resolves to a private IP when required.",
      failureMeaning: "DNS may be resolving to the public endpoint or missing private DNS zone links.",
      category: "dns"
    },
    {
      id: "check-storage-sas",
      title: "Check SAS token validity",
      purpose: "Confirm SAS time window, permissions, protocol, and IP restrictions match the request.",
      commands: [
        "Review SAS start time, expiry time, permissions, allowed IP, and HTTPS-only settings"
      ],
      successSignal: "SAS scope, time window, and restrictions allow the requested operation.",
      failureMeaning: "SAS may be expired, too narrowly scoped, IP-restricted, or missing required permissions.",
      category: "auth"
    }
  ];
}

function enrichFailureBranches(branches: FailureBranch[]): FailureBranch[] {
  const required = azureStorageFailureBranches();
  let next = [...branches];
  const text = branchText(next);

  next = appendIfMissing(next, /(rbac|role assignment|data-plane|data plane|permission)/.test(text), required[0]);
  next = appendIfMissing(next, /(network|firewall)/.test(branchText(next)), required[1]);
  next = appendIfMissing(next, /(private endpoint|dns)/.test(branchText(next)), required[2]);
  next = appendIfMissing(next, /(sas|shared access signature|token)/.test(branchText(next)), required[3]);

  return next;
}

function enrichQuickTests(tests: QuickTest[]): QuickTest[] {
  const required = azureStorageQuickTests();
  let next = [...tests];
  const text = quickTestText(next);

  next = appendIfMissing(next, /(rbac|role assignment|data-plane|data plane|permission)/.test(text), required[0]);
  next = appendIfMissing(next, /(network|firewall)/.test(quickTestText(next)), required[1]);
  next = appendIfMissing(next, /(private endpoint|dns)/.test(quickTestText(next)), required[2]);
  next = appendIfMissing(next, /(sas|shared access signature|token)/.test(quickTestText(next)), required[3]);

  return next;
}

function enrichDiagnosticTerminal(
  terminal: DiagnosticTerminal | undefined,
  quickTests: QuickTest[]
): DiagnosticTerminal {
  const baseTerminal: DiagnosticTerminal = terminal ?? {
    title: "Diagnostic terminal",
    shell: "bash",
    commands: []
  };
  const commands = [...baseTerminal.commands];
  const commandValues = new Set(commands.map((item) => item.command));
  const requiredCommands = quickTests
    .filter((test) =>
      ["check-storage-rbac", "check-storage-network", "check-storage-private-dns"].includes(test.id)
    )
    .flatMap((test) =>
      test.commands.map((command, index) => ({
        id: `cmd-${test.id}-${index + 1}`,
        label: test.title,
        command,
        category: test.category
      }))
    );

  for (const command of requiredCommands) {
    if (!commandValues.has(command.command)) {
      commands.push(command);
      commandValues.add(command.command);
    }
  }

  return {
    ...baseTerminal,
    title: baseTerminal.title || "Diagnostic terminal",
    shell: baseTerminal.shell === "generic" ? "bash" : baseTerminal.shell,
    commands,
    notes: [
      ...new Set([
        ...(baseTerminal.notes ?? []),
        "Run these checks from the client, automation host, or network path that receives the access denied response."
      ])
    ]
  };
}

export function enrichFixResultForKnownPatterns(
  result: FixWorkspaceResult,
  prompt: string
): FixWorkspaceResult {
  if (!isAzureStorageAccessDeniedPrompt(prompt)) return result;

  const failureBranches = enrichFailureBranches(result.failureBranches ?? []);
  const quickTests = enrichQuickTests(result.quickTests ?? []);
  const terminal = enrichDiagnosticTerminal(result.diagnosticTerminal, quickTests);

  return {
    ...result,
    failureBranches,
    causalGraph: result.causalGraph ?? inferCausalGraphFromPrompt(prompt),
    quickTests,
    diagnosticTerminal: terminal,
    pathUpdate: {
      status: result.pathUpdate?.status ?? "initial",
      title: result.pathUpdate?.title || "Validate storage access path",
      description:
        result.pathUpdate?.description ||
        "Check authorization and network controls in order so the access denied path can narrow quickly.",
      nextBestAction: {
        title: "Check RBAC data-plane role assignment",
        description:
          "Start by confirming the caller has a Storage Blob Data role at the correct scope, then validate network restrictions if RBAC is present.",
        commands: [
          "az role assignment list --assignee <principal-id> --scope <storage-scope> -o table"
        ]
      }
    },
    artifacts: (result.artifacts ?? []).length > 0
      ? result.artifacts
      : [
          { type: "ticket_update", label: "Create ticket update" },
          { type: "runbook", label: "Export executable runbook" },
          { type: "save_journey", label: "Save journey workspace" },
          { type: "share", label: "Share with team" }
        ]
  };
}
