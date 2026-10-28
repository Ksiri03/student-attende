"use strict";

const { getThreshold } = require("./database");
const { monthBounds } = require("./validation");

function roundPercentage(value) {
  return Number(value.toFixed(2));
}

function percentage(present, total) {
  return total > 0 ? roundPercentage((present / total) * 100) : 0;
}

function getMonthlyReport(db, month) {
  const threshold = getThreshold(db);
  const { start, end } = monthBounds(month);

  const classWorkingPeriods = db.prepare(`
    SELECT COUNT(*) AS total
    FROM working_periods
    WHERE attendance_date >= ? AND attendance_date < ?
  `).get(start, end).total;

  const students = db.prepare(`
    SELECT
      s.id,
      s.roll_number,
      s.name,
      s.department,
      COUNT(a.id) AS working_periods,
      COALESCE(SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END), 0) AS present,
      COALESCE(SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent
    FROM students s
    LEFT JOIN attendance a
      ON a.student_id = s.id
      AND a.attendance_date >= ?
      AND a.attendance_date < ?
    GROUP BY s.id
    ORDER BY s.roll_number COLLATE NOCASE, s.name COLLATE NOCASE
  `).all(start, end);

  const rows = students.map((student) => {
    const workingPeriods = Number(student.working_periods || 0);
    const present = Number(student.present || 0);
    const absent = Number(student.absent || 0);
    const attendancePercentage = percentage(present, workingPeriods);

    return {
      id: student.id,
      roll_number: student.roll_number,
      name: student.name,
      department: student.department,
      working_periods: workingPeriods,
      present,
      absent,
      attendance_percentage: attendancePercentage,
      low_attendance: workingPeriods > 0 && attendancePercentage < threshold,
    };
  });

  const totalPresent = rows.reduce((total, row) => total + row.present, 0);
  const totalAbsent = rows.reduce((total, row) => total + row.absent, 0);
  const totalRecorded = rows.reduce(
    (total, row) => total + row.working_periods,
    0,
  );

  return {
    month,
    threshold,
    class_working_periods: Number(classWorkingPeriods || 0),
    student_count: rows.length,
    total_present: totalPresent,
    total_absent: totalAbsent,
    total_recorded_periods: totalRecorded,
    average_percentage: percentage(totalPresent, totalRecorded),
    low_attendance_count: rows.filter((row) => row.low_attendance).length,
    students: rows,
  };
}

function getDailyHistory(db, month) {
  const { start, end } = monthBounds(month);

  const rows = db.prepare(`
    SELECT
      wp.attendance_date,
      COUNT(DISTINCT wp.period) AS working_periods,
      COUNT(DISTINCT a.student_id) AS students_marked,
      COALESCE(SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END), 0) AS present,
      COALESCE(SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent
    FROM working_periods wp
    LEFT JOIN attendance a
      ON a.attendance_date = wp.attendance_date
      AND a.period = wp.period
    WHERE wp.attendance_date >= ? AND wp.attendance_date < ?
    GROUP BY wp.attendance_date
    ORDER BY wp.attendance_date DESC
  `).all(start, end);

  return rows.map((row) => {
    const present = Number(row.present || 0);
    const absent = Number(row.absent || 0);
    const recorded = present + absent;

    return {
      date: row.attendance_date,
      working_periods: Number(row.working_periods || 0),
      students_marked: Number(row.students_marked || 0),
      present,
      absent,
      percentage: percentage(present, recorded),
    };
  });
}

function getDateSummary(db, date) {
  const workingPeriods = db.prepare(`
    SELECT COUNT(*) AS total
    FROM working_periods
    WHERE attendance_date = ?
  `).get(date).total;

  const attendance = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END), 0) AS present,
      COALESCE(SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent,
      COUNT(DISTINCT student_id) AS students_marked
    FROM attendance
    WHERE attendance_date = ?
  `).get(date);

  const present = Number(attendance.present || 0);
  const absent = Number(attendance.absent || 0);
  const recorded = present + absent;

  return {
    date,
    saved: Number(workingPeriods || 0) > 0,
    working_periods: Number(workingPeriods || 0),
    students_marked: Number(attendance.students_marked || 0),
    present,
    absent,
    percentage: percentage(present, recorded),
  };
}

function getIndividualReport(db, month, studentId) {
  const report = getMonthlyReport(db, month);
  const student = report.students.find((row) => row.id === studentId);

  if (!student) {
    return null;
  }

  const { start, end } = monthBounds(month);
  const records = db.prepare(`
    SELECT attendance_date, period, status
    FROM attendance
    WHERE student_id = ?
      AND attendance_date >= ?
      AND attendance_date < ?
    ORDER BY attendance_date, period
  `).all(studentId, start, end);

  const days = new Map();
  for (const record of records) {
    if (!days.has(record.attendance_date)) {
      days.set(record.attendance_date, []);
    }
    days.get(record.attendance_date).push({
      period: record.period,
      status: record.status,
    });
  }

  const daily = Array.from(days.entries()).map(([date, periods]) => {
    const present = periods.filter((item) => item.status === "Present").length;
    const absent = periods.filter((item) => item.status === "Absent").length;

    return {
      date,
      present,
      absent,
      percentage: percentage(present, periods.length),
      periods,
    };
  });

  return {
    ...student,
    month,
    threshold: report.threshold,
    class_working_periods: report.class_working_periods,
    daily,
  };
}

module.exports = {
  roundPercentage,
  percentage,
  getMonthlyReport,
  getDailyHistory,
  getDateSummary,
  getIndividualReport,
};
