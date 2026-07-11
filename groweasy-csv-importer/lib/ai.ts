import { CRM_STATUS_VALUES, DATA_SOURCE_VALUES, CrmRecord } from "./types";

const SYSTEM_PROMPT = `You are a data-mapping engine for a CRM lead importer. You will be given raw CSV rows (as JSON objects with arbitrary, inconsistent column names) exported from sources such as Facebook Lead Ads, Google Ads, Excel sheets, real-estate CRMs, sales reports, or manually created spreadsheets.

Your job: map each raw row into the GrowEasy CRM schema below. Column names in the input are NOT fixed or predictable — infer meaning from header names, sample values, and context (e.g. a column named "Phone", "Mobile No", "Contact Number", or "WhatsApp" should all map to a mobile number field; "Full Name", "Lead Name", "Customer" all map to name).

Return ONLY a JSON array, one object per input row, in the same order as the input. No prose, no markdown fences, no explanation.

CRM SCHEMA (every key must be present in every output object; use "" for unknown/missing values):
- created_at: string. Must be parseable by JavaScript's "new Date(created_at)". If no creation date is present in the row, use "" (leave blank) — do not invent a date.
- name: string. Lead's full name.
- email: string. The FIRST email address found for this lead.
- country_code: string. e.g. "+91". Infer from phone number formatting when possible, otherwise "".
- mobile_without_country_code: string. The FIRST mobile number, digits only, without country code.
- company: string.
- city: string.
- state: string.
- country: string.
- lead_owner: string. The salesperson/agent/owner assigned to this lead, if present.
- crm_status: string. MUST be exactly one of: ${CRM_STATUS_VALUES.join(", ")}. Infer from any status/stage/remarks column. If genuinely unclear, use "".
- crm_note: string. Put here: any remarks, follow-up notes, additional comments, and any EXTRA email addresses or EXTRA phone numbers beyond the first one of each (clearly labeled, e.g. "Alt email: x@y.com; Alt phone: 12345"). Also put here any other useful info from the row that doesn't fit a schema field.
- data_source: string. MUST be exactly one of: ${DATA_SOURCE_VALUES.join(", ")}, or "" if nothing in the row confidently matches one of these. Do not guess a value that isn't clearly implied.
- possession_time: string. Property possession timeline, if this is a real-estate lead export.
- description: string. Any additional free-text description of the lead/inquiry.

CRITICAL RULES:
1. crm_status and data_source must ONLY use the exact allowed values listed above, or "". Never invent new values.
2. If a row has NEITHER an email NOR a mobile number anywhere in it, you must still return an object for it, but set a special field "_skip": true and "_skip_reason": "<short reason>" on that object instead of populating CRM fields. This lets the caller filter it out.
3. Never fabricate data (dates, emails, phone numbers, names) that isn't present or clearly derivable from the row.
4. Each output object must be flat, single-level JSON — no nested objects, no arrays, no literal newline characters inside string values (use "\\n" if a line break is truly needed).
5. Output array length must exactly equal input array length, same order, so the caller can re-associate results with original rows.`;

function buildUserPrompt(rows: Record<string, string>[]): string {
  return `Map these ${rows.length} CSV rows into the GrowEasy CRM schema. Input rows (JSON array, arbitrary column names):\n\n${JSON.stringify(
    rows,
    null,
    0
  )}\n\nReturn the JSON array now.`;
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```\s*$/, "")
    .trim();
}

async function callAnthropic(rows: Record<string, string>[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(rows) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }
  const data = await res.json();
  const text = (data.content || [])
    .map((block: { type: string; text?: string }) =>
      block.type === "text" ? block.text : ""
    )
    .join("");
  return text;
}

async function callOpenAI(rows: Record<string, string>[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(rows) },
      ],
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Calls the configured LLM provider for a single batch of raw CSV rows and
 * returns the parsed array of mapped objects (may include "_skip" markers).
 * Retries once on transient failure or malformed JSON.
 */
export async function extractBatch(
  rows: Record<string, string>[],
  attempt = 1
): Promise<Record<string, unknown>[]> {
  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();

  try {
    const raw =
      provider === "openai" ? await callOpenAI(rows) : await callAnthropic(rows);
    const cleaned = stripCodeFences(raw);
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      throw new Error("Model did not return a JSON array");
    }
    return parsed;
  } catch (err) {
    if (attempt < 2) {
      // Retry once — handles transient network/parse issues.
      return extractBatch(rows, attempt + 1);
    }
    throw err;
  }
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
