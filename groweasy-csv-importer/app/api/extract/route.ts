import { NextRequest, NextResponse } from "next/server";
import { extractBatch, chunk } from "@/lib/ai";
import {
  CrmRecord,
  CRM_STATUS_VALUES,
  DATA_SOURCE_VALUES,
  ExtractionResult,
} from "@/lib/types";

export const maxDuration = 60;

const BATCH_SIZE = 20;

function sanitize(raw: Record<string, unknown>): CrmRecord {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const status = str(raw.crm_status);
  const source = str(raw.data_source);
  return {
    created_at: str(raw.created_at),
    name: str(raw.name),
    email: str(raw.email),
    country_code: str(raw.country_code),
    mobile_without_country_code: str(raw.mobile_without_country_code),
    company: str(raw.company),
    city: str(raw.city),
    state: str(raw.state),
    country: str(raw.country),
    lead_owner: str(raw.lead_owner),
    crm_status: (CRM_STATUS_VALUES as readonly string[]).includes(status)
      ? (status as CrmRecord["crm_status"])
      : "",
    crm_note: str(raw.crm_note),
    data_source: (DATA_SOURCE_VALUES as readonly string[]).includes(source)
      ? (source as CrmRecord["data_source"])
      : "",
    possession_time: str(raw.possession_time),
    description: str(raw.description),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows: Record<string, string>[] = body?.rows;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "Request body must include a non-empty 'rows' array." },
        { status: 400 }
      );
    }

    const batches = chunk(rows, BATCH_SIZE);
    const imported: CrmRecord[] = [];
    const skipped: ExtractionResult["skipped"] = [];

    // Process batches sequentially to stay within rate limits; each batch
    // internally retries once on failure (see lib/ai.ts).
    for (const batch of batches) {
      try {
        const results = await extractBatch(batch);

        results.forEach((r, i) => {
          const originalRow = batch[i];
          if (!originalRow) return;

          if (r && (r as { _skip?: boolean })._skip) {
            skipped.push({
              row: originalRow,
              reason:
                (r as { _skip_reason?: string })._skip_reason ||
                "No email or mobile number found",
            });
            return;
          }

          const record = sanitize(r);
          if (!record.email && !record.mobile_without_country_code) {
            skipped.push({
              row: originalRow,
              reason: "No email or mobile number found",
            });
            return;
          }
          imported.push(record);
        });
      } catch (batchErr) {
        // If an entire batch fails even after retry, skip its rows with a
        // clear reason rather than failing the whole import.
        const message =
          batchErr instanceof Error ? batchErr.message : "AI batch failed";
        batch.forEach((row) =>
          skipped.push({ row, reason: `AI processing failed: ${message}` })
        );
      }
    }

    const result: ExtractionResult = {
      imported,
      skipped,
      totalImported: imported.length,
      totalSkipped: skipped.length,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to process import: ${message}` },
      { status: 500 }
    );
  }
}
