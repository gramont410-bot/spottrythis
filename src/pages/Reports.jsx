import React, { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useSpot } from '../context/SpotContext';
import { CheckCircle2, Download, FileSpreadsheet, FileText, RefreshCcw } from 'lucide-react';

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

export default function Reports() {
  const { role } = useAuth();
  const { patrols, incidents, checkpointLogs, auditLogs, addToast } = useSpot();
  const [reportType, setReportType] = useState('Daily Patrol Summary');
  const [dateRange, setDateRange] = useState('All Available Data');
  const [format, setFormat] = useState('CSV');
  const [generatedReport, setGeneratedReport] = useState(null);

  const reportRows = useMemo(() => {
    if (reportType === 'Guard Audit Trail') return [['Timestamp', 'Actor', 'Category', 'Action', 'Details'], ...auditLogs.map((log) => [log.timestamp, log.actor, log.category, log.action, log.details])];
    if (reportType === 'Incident Report') return [['Incident', 'Site', 'Priority', 'Reporter', 'Status'], ...incidents.map((item) => [item.title, item.siteName, item.priority, item.reporterName, item.status])];
    if (reportType === 'Checkpoint Scan Report') return [['Time', 'Guard', 'Checkpoint', 'Site', 'Verified'], ...checkpointLogs.map((item) => [item.timestamp, item.guardName, item.checkpointName, item.siteId, item.verified ? 'Yes' : 'No'])];
    return [['Guard', 'Site', 'Status', 'Progress', 'Completed', 'Total'], ...patrols.map((item) => [item.guardName, item.siteName, item.status, `${item.progressPct}%`, item.completedCount, item.totalCount])];
  }, [reportType, auditLogs, incidents, checkpointLogs, patrols]);

  const generate = () => {
    const title = `${reportType} (${dateRange})`;
    setGeneratedReport({ title, generatedAt: new Date().toLocaleString(), recordsCount: Math.max(reportRows.length - 1, 0) });
    addToast('Report Ready', `${reportRows.length - 1} live records prepared.`, 'success');
  };

  const download = () => {
    if (format === 'CSV') downloadCsv(generatedReport.title, reportRows);
    else window.print();
  };

  return (
    <Layout title="Operational Reports" subtitle={role === 'superadmin' ? 'Complete agency-wide reporting and audit export' : 'Assigned client operations reporting'}>
      <div className="max-w-5xl space-y-6">
        <div className="card-spot space-y-5">
          <h3 className="flex items-center gap-2 border-b border-slate-800 pb-3 text-base font-bold text-white"><FileSpreadsheet className="h-5 w-5 text-cyan-300" /> Live report builder</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <select className="input-spot" value={reportType} onChange={(event) => setReportType(event.target.value)}><option>Daily Patrol Summary</option><option>Checkpoint Scan Report</option><option>Incident Report</option><option>Guard Audit Trail</option></select>
            <select className="input-spot" value={dateRange} onChange={(event) => setDateRange(event.target.value)}><option>All Available Data</option><option>Today</option><option>Last 7 Days</option><option>Last 30 Days</option></select>
            <div className="grid grid-cols-2 gap-2"><button onClick={() => setFormat('CSV')} className={`rounded-xl border text-xs font-bold ${format === 'CSV' ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200' : 'border-slate-800 text-slate-400'}`}>CSV</button><button onClick={() => setFormat('PRINT')} className={`rounded-xl border text-xs font-bold ${format === 'PRINT' ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-slate-800 text-slate-400'}`}>Print / PDF</button></div>
          </div>
          <div className="flex justify-end"><button onClick={generate} className="btn-primary"><RefreshCcw className="h-4 w-4" /> Prepare live report</button></div>
        </div>
        {generatedReport && <div className="card-spot border-cyan-400/30 bg-cyan-950/20"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><CheckCircle2 className="h-7 w-7 text-emerald-300" /><div><h4 className="font-bold text-white">{generatedReport.title}</h4><p className="text-xs text-slate-400">{generatedReport.recordsCount} live records · {generatedReport.generatedAt}</p></div></div><button onClick={download} className="btn-primary">{format === 'CSV' ? <Download className="h-4 w-4" /> : <FileText className="h-4 w-4" />} {format === 'CSV' ? 'Download CSV' : 'Print / Save PDF'}</button></div></div>}
      </div>
    </Layout>
  );
}
