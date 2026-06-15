import { buildLocalRedefinedResult, classifyWithRules } from "@/lib/redefined";
import { validateFixResultQuality } from "@/lib/quality";
import { FixWorkspaceResultSchema } from "@/lib/schemas";

const prompts = [
  "Power BI Gateway to SQL MI, not connecting to database",
  "User cannot login to enterprise application after SSO setup",
  "Website checkout fails after payment confirmation",
  "Azure App Service deployment fails after GitHub Actions",
  "DNS record resolves publicly but private endpoint should be used",
  "Kubernetes pod keeps restarting after deployment",
  "API returns 401 after token refresh",
  "Terraform apply fails because resource already exists",
  "Database timeout after moving app to private network",
  "Email delivery fails with SPF/DKIM error"
];

for (const prompt of prompts) {
  const classification = classifyWithRules(prompt);
  const localResult = buildLocalRedefinedResult(prompt, {
    ...classification,
    mode: "fix"
  });
  const parsedResult = FixWorkspaceResultSchema.parse(localResult);
  const quality = validateFixResultQuality(parsedResult);

  console.log(`\n${prompt}`);
  console.log(`ok: ${quality.ok}`);
  console.log(`issues: ${quality.issues.length ? quality.issues.join(" | ") : "none"}`);
  console.log(`warnings: ${quality.warnings.length ? quality.warnings.join(" | ") : "none"}`);
}
