const { getSQL } = require("../shared/db");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const sql = getSQL();

  try {
    const companyId = req.query.company_id || (req.body && req.body.company_id);
    if (!companyId) return res.status(400).json({ error: "Company ID is required" });

    if (req.method === "GET") {
      const employees = await sql`
        SELECT * FROM employees
        WHERE company_id = ${companyId}
        ORDER BY id DESC
      `;

      return res.status(200).json({ success: true, employees });
    }

    if (req.method === "POST") {
      const { action, id, name, designation, salary, email, phone, demographic_details, date_joined, is_active, month_year, is_paid, pf_amount, hra_amount, esi_amount, insurance_amount } = req.body || {};

      // Toggle Salary Paid / Unpaid Status
      if (action === "toggle_salary") {
        if (!id || !month_year) {
          return res.status(400).json({ error: "Employee ID and Month-Year are required for salary update" });
        }
        const paidDate = is_paid ? new Date().toISOString().split("T")[0] : null;
        await sql`
          INSERT INTO salary_payments (employee_id, month_year, is_paid, paid_date)
          VALUES (${id}, ${month_year}, ${Boolean(is_paid)}, ${paidDate})
          ON CONFLICT (employee_id, month_year)
          DO UPDATE SET is_paid = EXCLUDED.is_paid, paid_date = EXCLUDED.paid_date
        `;
        return res.status(200).json({ success: true, message: "Salary payment status updated successfully" });
      }

      // Toggle Active / Inactive Employee Status
      if (action === "toggle_active") {
        if (!id) return res.status(400).json({ error: "Employee ID is required" });
        await sql`
          UPDATE employees
          SET is_active = ${Boolean(is_active)}
          WHERE id = ${id}
        `;
        return res.status(200).json({ success: true, message: "Employee active status updated" });
      }

      // Add New Employee
      if (!name || !designation || !salary || !date_joined) {
        return res.status(400).json({ error: "Missing required employee details (name, designation, salary, date_joined)" });
      }

      const pfVal = parseFloat(pf_amount) || 0.0;
      const hraVal = parseFloat(hra_amount) || 0.0;
      const esiVal = parseFloat(esi_amount) || 0.0;
      const insVal = parseFloat(insurance_amount) || 0.0;

      const newEmp = await sql`
        INSERT INTO employees (company_id, name, designation, salary, email, phone, demographic_details, date_joined, is_active, pf_amount, hra_amount, esi_amount, insurance_amount)
        VALUES (${companyId}, ${name}, ${designation}, ${parseFloat(salary)}, ${email || ''}, ${phone || ''}, ${demographic_details || ''}, ${date_joined}, ${is_active !== undefined ? Boolean(is_active) : true}, ${pfVal}, ${hraVal}, ${esiVal}, ${insVal})
        RETURNING *
      `;

      return res.status(201).json({ success: true, employee: newEmp[0] });
    }

    if (req.method === "DELETE") {
      const id = req.query.id || (req.body && req.body.id);
      if (!id) return res.status(400).json({ error: "Employee ID is required" });

      await sql`DELETE FROM employees WHERE id = ${id}`;
      return res.status(200).json({ success: true, message: "Employee deleted successfully" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Employee API Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
