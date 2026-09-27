import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpot } from '../context/SpotContext';

const TIME_ZONE = 'Asia/Manila';

function todayKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (type) =>
    parts.find((part) => part.type === type)?.value || '';

  return `${get('year')}-${get('month')}-${get('day')}`;
}

function normalizeId(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const replacements = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return replacements[character];
  });
}

function statusLabel(record) {
  switch (record.status) {
    case 'ON_DUTY':
      return record.isOnDuty ? 'On Duty' : 'Needs Review';
    case 'SHIFT_ENDED':
      return 'Shift Ended';
    case 'NEEDS_REVIEW':
      return 'Needs Review';
    default:
      return record.status || 'Unknown';
  }
}

function displayedTimeOut(record) {
  if (!record.timeOut) return '—';

  if (record.timeOutDate && record.timeOutDate !== record.date) {
    return `${record.timeOutDate} ${record.timeOut}`;
  }

  return record.timeOut;
}

function hoursLabel(minutes) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function SiteAttendance({ site }) {
  const { attendance = [], guards = [] } = useSpot();

  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(todayKey);
  const [guardFilter, setGuardFilter] = useState('');
  const [includeFormerGuards, setIncludeFormerGuards] = useState(false);
  const [printError, setPrintError] = useState('');

  const siteId = normalizeId(site?.id);
  const siteName = site?.name || site?.siteName || 'Site';

  const invalidRange =
    !startDate || !endDate || startDate > endDate;

  const assignedGuards = useMemo(
    () =>
      guards.filter((guard) => {
        const assignedSiteId = normalizeId(
          guard.assignedSiteId || guard.siteId
        );

        return siteId !== '' && assignedSiteId === siteId;
      }),
    [guards, siteId]
  );

  const assignedGuardIds = useMemo(() => {
    const ids = new Set();

    assignedGuards.forEach((guard) => {
      // Support Firebase user IDs and existing guard identifiers.
      [guard.id, guard.authUid, guard.uid, guard.guardId].forEach(
        (value) => {
          const id = normalizeId(value);
          if (id) ids.add(id);
        }
      );
    });

    return ids;
  }, [assignedGuards]);

  const siteRecords = useMemo(
    () =>
      attendance.filter((record) => {
        if (!siteId || normalizeId(record.siteId) !== siteId) {
          return false;
        }

        // Face enrollment is not an attendance shift.
        if (record.status === 'Face Enrolled') {
          return false;
        }

        return (
          includeFormerGuards ||
          assignedGuardIds.has(normalizeId(record.guardId))
        );
      }),
    [attendance, siteId, includeFormerGuards, assignedGuardIds]
  );

  const guardOptions = useMemo(() => {
    const options = new Map();

    siteRecords.forEach((record) => {
      const id = normalizeId(record.guardId);

      if (id && !options.has(id)) {
        options.set(id, record.guardName || 'Guard');
      }
    });

    return [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [siteRecords]);

  const records = useMemo(() => {
    if (invalidRange) return [];

    return siteRecords
      .filter((record) => {
        // Date filters use the shift's Time In date.
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(
          record.date || ''
        );

        return (
          validDate &&
          record.date >= startDate &&
          record.date <= endDate &&
          (!guardFilter ||
            normalizeId(record.guardId) === guardFilter)
        );
      })
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          (b.timeInMs ?? 0) - (a.timeInMs ?? 0)
      );
  }, [siteRecords, startDate, endDate, guardFilter, invalidRange]);

  const totalMinutes = records.reduce(
    (total, record) =>
      total +
      (record.status === 'SHIFT_ENDED' &&
      Number.isFinite(record.totalMinutes)
        ? record.totalMinutes
        : 0),
    0
  );

  const onDutyCount = records.filter(
    (record) => record.isOnDuty
  ).length;

  const missingDateCount = siteRecords.filter(
    (record) => !/^\d{4}-\d{2}-\d{2}$/.test(record.date || '')
  ).length;

  function printAttendance() {
    setPrintError('');

    const printWindow = window.open(
      '',
      '_blank',
      'width=1100,height=800'
    );

    if (!printWindow) {
      setPrintError(
        'Your browser blocked the print window. Allow pop-ups for this website and try again.'
      );
      return;
    }

    const guardName = guardFilter
      ? guardOptions.find((guard) => guard.id === guardFilter)?.name ||
        guardFilter
      : 'All guards';

    const rosterScope = includeFormerGuards
      ? 'All guards with attendance at this site'
      : 'Currently assigned guards';

    const rows = records
      .map(
        (record) => `
          <tr>
            <td>${escapeHtml(record.guardName)}</td>
            <td>${escapeHtml(record.date)}</td>
            <td>${escapeHtml(record.timeIn || '—')}</td>
            <td>${escapeHtml(displayedTimeOut(record))}</td>
            <td>${escapeHtml(record.durationLabel || '—')}</td>
            <td>${escapeHtml(statusLabel(record))}</td>
          </tr>
        `
      )
      .join('');

    printWindow.document.write(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Attendance — ${escapeHtml(siteName)}</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 14mm;
            }

            body {
              font-family: Arial, sans-serif;
              color: #111827;
              margin: 24px;
              font-size: 12px;
            }

            h1 {
              margin: 0 0 8px;
              font-size: 22px;
            }

            p {
              margin: 5px 0;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }

            th, td {
              border: 1px solid #cbd5e1;
              padding: 9px;
              text-align: left;
              vertical-align: top;
            }

            th {
              background: #f1f5f9;
            }

            thead {
              display: table-header-group;
            }

            tr {
              break-inside: avoid;
            }

            .note {
              margin-top: 16px;
              color: #475569;
            }

            @media print {
              body {
                margin: 0;
              }
            }
          </style>
        </head>
        <body>
          <h1>S.P.O.T. — Guard Attendance</h1>
          <p><strong>Site:</strong> ${escapeHtml(siteName)}</p>
          <p><strong>Site ID:</strong> ${escapeHtml(siteId)}</p>
          <p>
            <strong>Time In dates:</strong>
            ${escapeHtml(startDate)} to ${escapeHtml(endDate)}
          </p>
          <p><strong>Guards:</strong> ${escapeHtml(guardName)}</p>
          <p><strong>Scope:</strong> ${escapeHtml(rosterScope)}</p>
          <p><strong>Time zone:</strong> Asia/Manila</p>

          <table>
            <thead>
              <tr>
                <th>Guard</th>
                <th>Date</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <p class="note">
            Records: ${records.length}
            · Completed shift duration: ${escapeHtml(
              hoursLabel(totalMinutes)
            )}
          </p>
          <p class="note">
            Duration is elapsed time between Time In and Time Out.
            Break deductions and payroll adjustments are not included.
            Open shifts and records without valid timestamps are
            excluded from the duration total.
          </p>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  if (!site) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPrintError('');
          setOpen(true);
        }}
        className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20"
      >
        Attendance
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-3 sm:p-6">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="site-attendance-title"
              className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
            >
              <header className="flex items-center justify-between gap-4 border-b border-slate-700 p-5">
                <div>
                  <h2
                    id="site-attendance-title"
                    className="text-lg font-bold text-white"
                  >
                    {siteName} — Attendance
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Guard Time In and Time Out · Philippine time
                  </p>
                </div>

                <button
                  type="button"
                  autoFocus
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Close
                </button>
              </header>

              <div className="space-y-5 overflow-y-auto p-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-sm text-slate-300">
                    From
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) =>
                        setStartDate(event.target.value)
                      }
                      className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white [color-scheme:dark]"
                    />
                  </label>

                  <label className="text-sm text-slate-300">
                    To
                    <input
                      type="date"
                      value={endDate}
                      onChange={(event) =>
                        setEndDate(event.target.value)
                      }
                      className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white [color-scheme:dark]"
                    />
                  </label>

                  <label className="text-sm text-slate-300">
                    Guard
                    <select
                      value={guardFilter}
                      onChange={(event) =>
                        setGuardFilter(event.target.value)
                      }
                      className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white"
                    >
                      <option value="">All guards</option>
                      {guardOptions.map((guard) => (
                        <option key={guard.id} value={guard.id}>
                          {guard.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={invalidRange || records.length === 0}
                      onClick={printAttendance}
                      className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Print / Save PDF
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeFormerGuards}
                    onChange={(event) => {
                      setIncludeFormerGuards(event.target.checked);
                      setGuardFilter('');
                    }}
                    className="h-4 w-4 accent-blue-500"
                  />
                  Include guards previously assigned to this site
                </label>

                <p className="text-xs text-slate-400">
                  Dates filter by Time In. Overnight Time Out entries
                  show their ending date. No attendance record does
                  not automatically mean the guard was absent.
                </p>

                {invalidRange && (
                  <p role="alert" className="text-sm text-rose-300">
                    Select a valid date range. The From date must
                    not be later than the To date.
                  </p>
                )}

                {missingDateCount > 0 && (
                  <p className="text-sm text-amber-300">
                    {missingDateCount} older record(s) have no
                    supported date and cannot be included in this
                    date-filtered report.
                  </p>
                )}

                {printError && (
                  <p role="alert" className="text-sm text-rose-300">
                    {printError}
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <Summary label="Records shown" value={records.length} />
                  <Summary label="Open shifts shown" value={onDutyCount} />
                  <Summary
                    label="Completed shift duration"
                    value={hoursLabel(totalMinutes)}
                  />
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-700">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800 text-slate-300">
                      <tr>
                        {[
                          'Guard',
                          'Date',
                          'Time In',
                          'Time Out',
                          'Duration',
                          'Status',
                        ].map((heading) => (
                          <th
                            key={heading}
                            scope="col"
                            className="whitespace-nowrap px-4 py-3"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-800">
                      {records.map((record) => (
                        <tr key={record.id} className="text-slate-200">
                          <td className="px-4 py-3 font-medium">
                            {record.guardName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {record.date}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {record.timeIn || '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {displayedTimeOut(record)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {record.durationLabel || '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={
                                record.isOnDuty
                                  ? 'text-emerald-300'
                                  : 'text-slate-300'
                              }
                            >
                              {statusLabel(record)}
                            </span>
                          </td>
                        </tr>
                      ))}

                      {records.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-10 text-center text-slate-400"
                          >
                            {invalidRange
                              ? 'Choose a valid date range.'
                              : 'No attendance records match these filters.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-slate-500">
                  Completed duration excludes open shifts and records
                  without valid timestamps. Breaks and payroll
                  adjustments are not deducted.
                </p>
              </div>
            </section>
          </div>,
          document.body
        )}
    </>
  );
}

function Summary({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
}