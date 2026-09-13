import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { addItem, subscribeCollection, updateItem } from '../lib/dataSource';
import { useAuth } from '../context/AuthContext';
import { formatDateTime, toMillis } from '../lib/time';

const REQUIRED_APPROVALS = 3;

export default function Oversight() {
  const { user, profile } = useAuth();
  const [approvals, setApprovals] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState('approvals');

  useEffect(() => {
    const u1 = subscribeCollection('approvalRequests', setApprovals);
    const u2 = subscribeCollection('auditLogs', setAuditLogs);
    const u3 = subscribeCollection('users', setUsers);
    return () => { u1(); u2(); u3(); };
  }, []);

  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name || u.email]));
  const pending = approvals.filter((item) => item.status !== 'approved');
  const sortedAudit = useMemo(() =>
    [...auditLogs].sort((a, b) => toMillis(b.createdAt || b.timestamp) - toMillis(a.createdAt || a.timestamp))
  , [auditLogs]);

  const approve = async (request) => {
    const approvalsList = Array.isArray(request.approvals) ? request.approvals : [];
    if (approvalsList.includes(user.uid)) return;

    const nextApprovals = [...approvalsList, user.uid];
    const nextStatus = nextApprovals.length >= REQUIRED_APPROVALS ? 'approved' : 'pending';
    await updateItem('approvalRequests', request.id, {
      approvals: nextApprovals,
      status: nextStatus,
      lastApprovedBy: user.uid,
      lastApprovedByName: profile?.name || user.email
    });

    await addItem('auditLogs', {
      actorId: user.uid,
      actorName: profile?.name || user.email,
      action: 'approved_report_change',
      targetCollection: request.targetCollection,
      targetId: request.targetId,
      approvalRequestId: request.id
    });

    if (nextStatus === 'approved') {
      await updateItem(request.targetCollection, request.targetId, request.requestedChange || {});
      await addItem('auditLogs', {
        actorId: user.uid,
        actorName: profile?.name || user.email,
        action: 'applied_approved_report_change',
        targetCollection: request.targetCollection,
        targetId: request.targetId,
        approvalRequestId: request.id
      });
    }
  };

  return (
    <Layout
      title="Oversight"
      subtitle="Supervisor activity history and approval-controlled report changes"
      actions={
        <div className="flex gap-1 rounded-md border border-cyan-100 bg-cyan-50 p-1">
          {['approvals', 'activity'].map((key) => (
            <button key={key} onClick={() => setTab(key)} className={`rounded px-3 py-1 text-xs font-medium capitalize ${tab === key ? 'bg-cyan-700 text-white' : 'text-cyan-900 hover:bg-white'}`}>
              {key}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'approvals' ? (
        <div className="grid gap-4">
          {pending.map((request) => {
            const approvalsList = Array.isArray(request.approvals) ? request.approvals : [];
            const approvedByMe = approvalsList.includes(user.uid);
            return (
              <div key={request.id} className="card border-amber-100 bg-amber-50/30 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase text-amber-700">Report Modification Approval</div>
                    <h3 className="mt-1 font-semibold text-slate-950">{request.summary || 'Report change request'}</h3>
                    <p className="mt-1 text-sm text-slate-600">Requested by {request.requestedByName || userMap[request.requestedBy] || request.requestedBy}</p>
                    <p className="mt-2 text-xs text-slate-500">{request.reason || 'No reason provided.'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-slate-950">{approvalsList.length}/{REQUIRED_APPROVALS} approvals</div>
                    <div className="text-xs text-slate-500">Needs requester + 2 supervisors</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">Approvers: {approvalsList.map((id) => userMap[id] || id).join(', ') || '-'}</div>
                  <button className="btn-primary" onClick={() => approve(request)} disabled={approvedByMe}>
                    {approvedByMe ? 'Approved by You' : 'Approve Change'}
                  </button>
                </div>
              </div>
            );
          })}
          {pending.length === 0 && <div className="card p-8 text-center text-slate-400">No pending approvals.</div>}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Time</th>
                <th className="th">Supervisor</th>
                <th className="th">Action</th>
                <th className="th">Target</th>
              </tr>
            </thead>
            <tbody>
              {sortedAudit.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap">{formatDateTime(log.createdAt || log.timestamp)}</td>
                  <td className="td font-medium text-slate-950">{log.actorName || userMap[log.actorId] || log.actorId}</td>
                  <td className="td">{log.action}</td>
                  <td className="td font-mono text-xs">{log.targetCollection || '-'} / {log.targetId || '-'}</td>
                </tr>
              ))}
              {sortedAudit.length === 0 && <tr><td colSpan="4" className="td py-8 text-center text-slate-400">No supervisor activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
