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

    const todayStr = new Date().toISOString().split("T")[0];

    if (req.method === "GET") {
      // 1. Fetch current budget for today
      let todayBudgets = await sql`
        SELECT * FROM daily_budgets
        WHERE company_id = ${companyId} AND budget_date = ${todayStr}
      `;

      // Calculate rollover from previous days if today is not created yet
      let carriedOver = 0;
      if (todayBudgets.length === 0) {
        const prevBudgets = await sql`
          SELECT * FROM daily_budgets
          WHERE company_id = ${companyId} AND budget_date < ${todayStr}
          ORDER BY budget_date DESC LIMIT 1
        `;
        if (prevBudgets.length > 0) {
          carriedOver = parseFloat(prevBudgets[0].remaining_amount) || 0;
        }
      } else {
        carriedOver = parseFloat(todayBudgets[0].carried_over_amount) || 0;
      }

      const setAmount = todayBudgets.length > 0 ? parseFloat(todayBudgets[0].set_amount) : 0;

      // Calculate total spent today from documents with menu deduction
      // Deduction applies to menus: itr, gst, office, vehicles, travel, advances, formalities
      const docsToday = await sql`
        SELECT amount FROM documents
        WHERE company_id = ${companyId}
          AND doc_date = ${todayStr}
          AND menu_key IN ('itr', 'gst', 'office', 'vehicles', 'travel', 'advances', 'formalities')
      `;

      let totalSpentToday = 0;
      docsToday.forEach(d => {
        totalSpentToday += parseFloat(d.amount) || 0;
      });

      const totalAvailable = setAmount + carriedOver;
      const remainingToday = totalAvailable - totalSpentToday;

      return res.status(200).json({
        success: true,
        budget: {
          company_id: parseInt(companyId),
          date: todayStr,
          set_amount: setAmount,
          carried_over_amount: carriedOver,
          total_available: totalAvailable,
          total_spent: totalSpentToday,
          remaining_amount: remainingToday
        }
      });
    }

    if (req.method === "POST") {
      const { set_amount } = req.body || {};
      const numSetAmt = parseFloat(set_amount) || 0;

      // Find previous day carryover
      const prevBudgets = await sql`
        SELECT * FROM daily_budgets
        WHERE company_id = ${companyId} AND budget_date < ${todayStr}
        ORDER BY budget_date DESC LIMIT 1
      `;
      const carriedOver = prevBudgets.length > 0 ? (parseFloat(prevBudgets[0].remaining_amount) || 0) : 0;

      // Calculate current spent today
      const docsToday = await sql`
        SELECT amount FROM documents
        WHERE company_id = ${companyId}
          AND doc_date = ${todayStr}
          AND menu_key IN ('itr', 'gst', 'office', 'vehicles', 'travel', 'advances', 'formalities')
      `;
      let totalSpentToday = 0;
      docsToday.forEach(d => {
        totalSpentToday += parseFloat(d.amount) || 0;
      });

      const remainingAmt = (numSetAmt + carriedOver) - totalSpentToday;

      const updated = await sql`
        INSERT INTO daily_budgets (company_id, budget_date, set_amount, carried_over_amount, total_spent, remaining_amount)
        VALUES (${companyId}, ${todayStr}, ${numSetAmt}, ${carriedOver}, ${totalSpentToday}, ${remainingAmt})
        ON CONFLICT (company_id, budget_date)
        DO UPDATE SET
          set_amount = EXCLUDED.set_amount,
          carried_over_amount = EXCLUDED.carried_over_amount,
          total_spent = EXCLUDED.total_spent,
          remaining_amount = EXCLUDED.remaining_amount
        RETURNING *
      `;

      return res.status(200).json({
        success: true,
        budget: {
          ...updated[0],
          total_available: numSetAmt + carriedOver
        }
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Budget API Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
