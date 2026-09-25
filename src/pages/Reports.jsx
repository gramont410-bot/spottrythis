import React, { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useSpot } from '../context/SpotContext';
import {
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Printer,
  RefreshCcw,
  X,
} from 'lucide-react';

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function downloadCsv(title, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/*
 * ADDED FEATURE ONLY:
 * Report preview modal.
 *
 * Existing report types, data mapping, CSV generation, filters, and layout
 * remain unchanged.
 */
function ReportPreviewModal({ open, onClose, report, rows }) {
  if (!open || !report) return null;

  const headers = rows[0] || [];
  const dataRows = rows.slice(1);

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm print:static print:block print:bg-white print:p-0">
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none">

        {/* Preview toolbar - hidden when printing */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-900/80 px-5 py-4 print:hidden">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Eye className="h-4 w-4 text-cyan-300" />
              Report Preview
            </div>

            <p className="mt-1 text-xs text-slate-400">
              Review the report before printing or saving it as PDF.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 p-2 text-slate-400 transition hover:border-slate-500 hover:text-white"
            aria-label="Close report preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Printable area */}
        <div className="overflow-auto p-5 print:overflow-visible print:p-0">
          <div
            id="spot-report-print-area"
            className="mx-auto min-h-[700px] max-w-6xl rounded-xl bg-white p-7 text-slate-900 shadow-xl print:min-h-0 print:max-w-none print:rounded-none print:p-0 print:shadow-none"
          >
            <div className="border-b-2 border-slate-900 pb-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.22em] text-blue-700">
                    S.P.O.T.
                  </div>

                  <h1 className="mt-1 text-2xl font-black text-slate-950">
                    Security Patrol Report
                  </h1>

                  <p className="mt-1 text-sm text-slate-600">
                    Security Patrol &amp; Operations Tracker
                  </p>
                </div>

                <div className="text-right text-xs text-slate-600">
                  <div>
                    <span className="font-bold text-slate-900">Generated:</span>{' '}
                    {report.generatedAt}
                  </div>

                  <div className="mt-1">
                    <span className="font-bold text-slate-900">Records:</span>{' '}
                    {report.recordsCount}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Report
                </div>

                <div className="mt-1 text-sm font-bold text-slate-950">
                  {report.reportType}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Date Range
                </div>

                <div className="mt-1 text-sm font-bold text-slate-950">
                  {report.dateRange}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-950">
                {report.title}
              </h2>

              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-300 print:overflow-visible">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      {headers.map((header, index) => (
                        <th
                          key={`${header}-${index}`}
                          className="whitespace-nowrap border-r border-slate-700 px-3 py-2.5 font-bold last:border-r-0"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {dataRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={Math.max(headers.length, 1)}
                          className="px-4 py-10 text-center text-sm text-slate-500"
                        >
                          No records are available for this report.
                        </td>
                      </tr>
                    ) : (
                      dataRows.map((row, rowIndex) => (
                        <tr
                          key={`report-row-${rowIndex}`}
                          className="border-t border-slate-200 odd:bg-white even:bg-slate-50"
                        >
                          {headers.map((_, cellIndex) => (
                            <td
                              key={`report-cell-${rowIndex}-${cellIndex}`}
                              className="border-r border-slate-200 px-3 py-2 align-top text-slate-700 last:border-r-0"
                            >
                              {String(row[cellIndex] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-8 grid gap-8 border-t border-slate-300 pt-8 sm:grid-cols-2">
              <div>
                <div className="border-b border-slate-500 pb-6" />
                <div className="mt-2 text-xs font-semibold text-slate-600">
                  Prepared / Reviewed by Supervisor
                </div>
              </div>

              <div>
                <div className="border-b border-slate-500 pb-6" />
                <div className="mt-2 text-xs font-semibold text-slate-600">
                  Signature / Date
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Preview actions - hidden when printing */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/80 px-5 py-4 print:hidden">
          <div className="text-xs text-slate-400">
            {report.recordsCount} record{report.recordsCount === 1 ? '' : 's'} ready.
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Close Preview
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="btn-primary"
            >
              <Printer className="h-4 w-4" />
              Print / Save PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Reports() {
  const { role } = useAuth();
  const { patrols, incidents, checkpointLogs, auditLogs, sites, addToast } = useSpot();
  const [reportType, setReportType] = useState('Daily Patrol Summary');
  const [dateRange, setDateRange] = useState('All Available Data');
  const [format, setFormat] = useState('CSV');
  const [generatedReport, setGeneratedReport] = useState(null);

  // ADDED FEATURE ONLY:
  const [previewOpen, setPreviewOpen] = useState(false);

  // Resolve checkpoint site IDs into readable site names.
  // New checkpoint logs may already contain siteName; older logs can still
  // be displayed properly by looking up their siteId in the current sites list.
  const siteNameById = useMemo(() => {
    const map = new Map();

    (sites || []).forEach((site) => {
      const id = String(site.id || site.siteId || '').trim();
      const name = site.name || site.siteName || '';

      if (id && name) {
        map.set(id, name);
      }
    });

    return map;
  }, [sites]);

  const reportRows = useMemo(() => {
    if (reportType === 'Guard Audit Trail') return [['Timestamp', 'Actor', 'Category', 'Action', 'Details'], ...auditLogs.map((log) => [log.timestamp, log.actor, log.category, log.action, log.details])];
    if (reportType === 'Incident Report') return [['Incident', 'Site', 'Priority', 'Reporter', 'Status'], ...incidents.map((item) => [item.title, item.siteName, item.priority, item.reporterName, item.status])];
    if (reportType === 'Checkpoint Scan Report') return [['Time', 'Guard', 'Checkpoint', 'Site', 'Verified'], ...checkpointLogs.map((item) => [
      item.timestamp,
      item.guardName,
      item.checkpointName,
      item.siteName ||
        siteNameById.get(String(item.siteId || '').trim()) ||
        item.siteId ||
        'Unknown Site',
      (item.locationVerified || item.verified) ? 'Yes' : 'No'
    ])];
    return [['Guard', 'Site', 'Status', 'Progress', 'Completed', 'Total'], ...patrols.map((item) => [item.guardName, item.siteName, item.status, `${item.progressPct}%`, item.completedCount, item.totalCount])];
  }, [reportType, auditLogs, incidents, checkpointLogs, patrols, siteNameById]);

  const generate = () => {
    const title = `${reportType} (${dateRange})`;

    // Existing report information remains the same.
    // reportType/dateRange are only stored additionally for the preview header.
    setGeneratedReport({
      title,
      generatedAt: new Date().toLocaleString(),
      recordsCount: Math.max(reportRows.length - 1, 0),
      reportType,
      dateRange,
    });

    addToast('Report Ready', `${reportRows.length - 1} live records prepared.`, 'success');
  };

  const download = () => {
    if (format === 'CSV') {
      downloadCsv(generatedReport.title, reportRows);
    } else {
      // ADDED FEATURE:
      // Print/PDF now opens a preview first instead of immediately printing.
      setPreviewOpen(true);
    }
  };

  return (
    <>
      {/* ADDED FEATURE ONLY: print just the report, not the dashboard UI */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }

          #spot-report-print-area,
          #spot-report-print-area * {
            visibility: visible !important;
          }

          #spot-report-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
          }

          @page {
            size: auto;
            margin: 12mm;
          }
        }
      `}</style>

      <Layout title="Operational Reports" subtitle={role === 'superadmin' ? 'Complete agency-wide reporting and audit export' : 'Assigned client operations reporting'}>
        <div className="max-w-5xl space-y-6">
          <div className="card-spot space-y-5">
            <h3 className="flex items-center gap-2 border-b border-slate-800 pb-3 text-base font-bold text-white"><FileSpreadsheet className="h-5 w-5 text-cyan-300" /> Live report builder</h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <select className="input-spot" value={reportType} onChange={(event) => setReportType(event.target.value)}>
                <option>Daily Patrol Summary</option>
                <option>Checkpoint Scan Report</option>
                <option>Incident Report</option>
                <option>Guard Audit Trail</option>
              </select>

              <select className="input-spot" value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
                <option>All Available Data</option>
                <option>Today</option>
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
              </select>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setFormat('CSV')} className={`rounded-xl border text-xs font-bold ${format === 'CSV' ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200' : 'border-slate-800 text-slate-400'}`}>
                  CSV
                </button>

                <button onClick={() => setFormat('PRINT')} className={`rounded-xl border text-xs font-bold ${format === 'PRINT' ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-slate-800 text-slate-400'}`}>
                  Print / PDF
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={generate} className="btn-primary">
                <RefreshCcw className="h-4 w-4" />
                Prepare live report
              </button>
            </div>
          </div>

          {generatedReport && (
            <div className="card-spot border-cyan-400/30 bg-cyan-950/20">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-7 w-7 text-emerald-300" />

                  <div>
                    <h4 className="font-bold text-white">
                      {generatedReport.title}
                    </h4>

                    <p className="text-xs text-slate-400">
                      {generatedReport.recordsCount} live records · {generatedReport.generatedAt}
                    </p>
                  </div>
                </div>

                {/* Existing download button remains.
                    Preview button is the only additional control. */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className="btn-secondary"
                  >
                    <Eye className="h-4 w-4" />
                    Preview
                  </button>

                  <button onClick={download} className="btn-primary">
                    {format === 'CSV'
                      ? <Download className="h-4 w-4" />
                      : <FileText className="h-4 w-4" />
                    }

                    {format === 'CSV'
                      ? 'Download CSV'
                      : 'Print / Save PDF'
                    }
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Layout>

      {/* ADDED FEATURE ONLY */}
      <ReportPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        report={generatedReport}
        rows={reportRows}
      />
    </>
  );
}
