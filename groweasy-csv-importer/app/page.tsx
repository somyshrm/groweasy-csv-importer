"use client";

import { useCallback, useState } from "react";
import Papa from "papaparse";
import { CrmRecord, ExtractionResult } from "@/lib/types";

type Stage = "upload" | "preview" | "processing" | "results";

export default function Home() {
  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [dark, setDark] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  const parseFile = useCallback((file: File) => {
    setError("");
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.data.length) {
          setError("The CSV appears to be empty or could not be parsed.");
          return;
        }
        setHeaders(res.meta.fields || Object.keys(res.data[0]));
        setRows(res.data);
        setStage("preview");
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
      },
    });
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const handleConfirm = async () => {
    setStage("processing");
    setError("");
    setProgress({ done: 0, total: rows.length });
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Extraction failed");
      }
      setResult(data as ExtractionResult);
      setStage("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("preview");
    }
  };

  const reset = () => {
    setStage("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setResult(null);
    setError("");
  };

  const crmColumns: (keyof CrmRecord)[] = [
    "created_at",
    "name",
    "email",
    "country_code",
    "mobile_without_country_code",
    "company",
    "city",
    "state",
    "country",
    "lead_owner",
    "crm_status",
    "crm_note",
    "data_source",
    "possession_time",
    "description",
  ];

  return (
    <div className={dark ? "dark" : ""}>
      <main className="max-w-6xl mx-auto px-4 py-10">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              GrowEasy CSV Importer
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Upload any CSV export — the AI maps it into GrowEasy CRM format.
            </p>
          </div>
          <button
            onClick={() => setDark((d) => !d)}
            className="text-sm px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            {dark ? "☀️ Light" : "🌙 Dark"}
          </button>
        </header>

        <StepIndicator stage={stage} />

        {error && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {stage === "upload" && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`mt-8 border-2 border-dashed rounded-2xl p-16 text-center transition-colors ${
              isDragging
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                : "border-slate-300 dark:border-slate-700"
            }`}
          >
            <p className="text-lg font-medium mb-2">
              Drag & drop your CSV here
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">
              Facebook Lead Export, Google Ads Export, Excel sheets, real
              estate CRM exports — any column layout works.
            </p>
            <label className="inline-block cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition">
              Choose File
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={onFileChange}
              />
            </label>
          </div>
        )}

        {stage === "preview" && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-medium">{fileName}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {rows.length} rows · {headers.length} columns detected
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="text-sm px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                >
                  Confirm Import
                </button>
              </div>
            </div>
            <RawTable headers={headers} rows={rows} />
          </div>
        )}

        {stage === "processing" && (
          <div className="mt-16 flex flex-col items-center justify-center text-center">
            <div className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="font-medium">AI is mapping your CRM fields…</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Processing {rows.length} records in batches. This can take a
              moment for large files.
            </p>
          </div>
        )}

        {stage === "results" && result && (
          <div className="mt-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatCard label="Total Rows" value={rows.length} />
              <StatCard
                label="Imported"
                value={result.totalImported}
                accent="text-emerald-600 dark:text-emerald-400"
              />
              <StatCard
                label="Skipped"
                value={result.totalSkipped}
                accent="text-amber-600 dark:text-amber-400"
              />
              <StatCard
                label="Success Rate"
                value={`${
                  rows.length
                    ? Math.round((result.totalImported / rows.length) * 100)
                    : 0
                }%`}
              />
            </div>

            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Imported Records</h2>
              <button
                onClick={reset}
                className="text-sm px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Import Another File
              </button>
            </div>
            <CrmTable columns={crmColumns} records={result.imported} />

            {result.skipped.length > 0 && (
              <div className="mt-8">
                <h2 className="font-semibold mb-3">
                  Skipped Records ({result.skipped.length})
                </h2>
                <SkippedTable items={result.skipped} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StepIndicator({ stage }: { stage: Stage }) {
  const steps: { key: Stage; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "preview", label: "Preview" },
    { key: "processing", label: "AI Extraction" },
    { key: "results", label: "Results" },
  ];
  const order: Stage[] = ["upload", "preview", "processing", "results"];
  const currentIdx = order.indexOf(stage);

  return (
    <div className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              i <= currentIdx
                ? "bg-indigo-600 text-white"
                : "bg-slate-200 dark:bg-slate-800 text-slate-500"
            }`}
          >
            {i + 1}
          </div>
          <span
            className={
              i <= currentIdx
                ? "font-medium"
                : "text-slate-400 dark:text-slate-600"
            }
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div className="w-8 h-px bg-slate-300 dark:bg-slate-700 mx-1" />
          )}
        </div>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent || ""}`}>{value}</p>
    </div>
  );
}

function RawTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Record<string, string>[];
}) {
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-auto max-h-[480px]">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="text-left px-3 py-2 font-semibold whitespace-nowrap border-b border-slate-200 dark:border-slate-700"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-900/50"
            >
              {headers.map((h) => (
                <td
                  key={h}
                  className="px-3 py-2 whitespace-nowrap border-b border-slate-100 dark:border-slate-800"
                >
                  {row[h] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CrmTable({
  columns,
  records,
}: {
  columns: (keyof CrmRecord)[];
  records: CrmRecord[];
}) {
  if (records.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No records were successfully imported.
      </p>
    );
  }
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-auto max-h-[480px]">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="text-left px-3 py-2 font-semibold whitespace-nowrap border-b border-slate-200 dark:border-slate-700"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((rec, i) => (
            <tr
              key={i}
              className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-900/50"
            >
              {columns.map((c) => (
                <td
                  key={c}
                  className="px-3 py-2 whitespace-nowrap border-b border-slate-100 dark:border-slate-800"
                >
                  {rec[c] || (
                    <span className="text-slate-300 dark:text-slate-700">
                      —
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkippedTable({
  items,
}: {
  items: { row: Record<string, string>; reason: string }[];
}) {
  return (
    <div className="border border-amber-200 dark:border-amber-900 rounded-xl overflow-auto max-h-[320px]">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-amber-50 dark:bg-amber-950/40 z-10">
          <tr>
            <th className="text-left px-3 py-2 font-semibold border-b border-amber-200 dark:border-amber-900">
              Reason
            </th>
            <th className="text-left px-3 py-2 font-semibold border-b border-amber-200 dark:border-amber-900">
              Raw Row
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className="px-3 py-2 align-top whitespace-nowrap border-b border-amber-100 dark:border-amber-900/50 text-amber-700 dark:text-amber-400">
                {it.reason}
              </td>
              <td className="px-3 py-2 align-top border-b border-amber-100 dark:border-amber-900/50 text-slate-600 dark:text-slate-400 font-mono text-xs">
                {JSON.stringify(it.row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
