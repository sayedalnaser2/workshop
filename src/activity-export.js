// Worker activity as an Excel workbook: hours per day, finished tasks against their estimates, overtime and the activity log.
import ExcelJS from 'exceljs';
import { activity } from './tasks.js';

const h = (min) => Math.round(((Number(min) || 0) / 60) * 100) / 100;
export async function exportActivity(from, to, userId = null) {
  const a = activity(`${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`, userId);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Workshop Manager';
  const sheet = (name, cols, rows, widths = []) => { const ws = wb.addWorksheet(name); ws.addRow(cols).font = { bold: true }; rows.forEach((r) => ws.addRow(r)); ws.views = [{ state: 'frozen', ySplit: 1 }]; cols.forEach((_, i) => (ws.getColumn(i + 1).width = widths[i] || 16)); return ws; };
  const per = [...a.perDay].sort((x, y) => x.user_name.localeCompare(y.user_name) || x.day.localeCompare(y.day));
  sheet('Hours per day', ['Worker', 'Day', 'Shift hours', 'Hours on tasks', 'Not on a task', 'Overtime hours', 'Tasks'], per.map((r) => [r.user_name, r.day, h(r.shift_min), h(r.task_min), h(Math.max(0, r.shift_min - r.task_min)), h(r.overtime_min), r.tasks.map((t) => `${t.title} (${h(t.min)} h)`).join('; ')]), [22, 12, 12, 14, 14, 14, 60]);
  const tot = new Map(); for (const r of per) { const e = tot.get(r.user_name) || { shift: 0, task: 0, ot: 0 }; e.shift += r.shift_min; e.task += r.task_min; e.ot += r.overtime_min || 0; tot.set(r.user_name, e); }
  sheet('Totals per worker', ['Worker', 'Shift hours', 'Hours on tasks', 'Overtime hours', '% of shift on tasks'], [...tot.entries()].map(([n, e]) => [n, h(e.shift), h(e.task), h(e.ot), e.shift ? Math.round((e.task / e.shift) * 100) / 100 : 0]), [22, 14, 14, 14, 18]).getColumn(5).numFmt = '0%';
  sheet('Finished tasks', ['Task', 'Order', 'Stage', 'Worker', 'Estimate (h)', 'Actual (h)', 'Difference (h)'], a.done.map((t) => [t.title, t.order_inv || '', t.stage || '', t.assignee_name || '', h(t.estimate_min), h(t.actual_min), t.estimate_min ? h(t.actual_min - t.estimate_min) : '']), [36, 14, 14, 20, 12, 12, 14]);
  sheet('Overtime', ['Worker', 'Day', 'Hours', 'Task', 'Status', 'Note'], a.overtime.map((o) => [o.user_name, o.day, h(o.minutes), o.title || '', o.status, o.note || '']), [22, 12, 10, 32, 12, 40]);
  sheet('Activity log', ['When (UTC)', 'Worker', 'Task', 'What', 'Note', 'Progress %'], a.logs.map((l) => [l.ts, l.user_name, l.title, l.kind, l.text || '', l.progress ?? '']), [24, 20, 32, 12, 50, 12]);
  return wb.xlsx.writeBuffer();
}
