const { getSQL } = require("../shared/db");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const sql = getSQL();

  try {
    const todayStr = new Date().toISOString().split("T")[0];

    /* =================================================================
       GET — Two modes:
         1. ?company_id=X               → today's live budget summary
         2. ?action=history&company_id= → paginated date-wise history
            (super admin can pass company_id=all to get all companies)
    ================================================================= */
    if (req.method === "GET") {
      const action     = req.query.action;
      const companyId  = req.query.company_id;
      const dateFrom   = req.query.date_from;
      const dateTo     = req.query.date_to;

      if (!companyId) return res.status(400).json({ error: "company_id is required" });

      /* ── Mode 2: Full history with filters ── */
      if (action === "history") {
        let rows;

        if (companyId === "all") {
          // Super admin: all companies
          rows = await sql`
            SELECT db.*, c.name AS company_name
            FROM daily_budgets db
            JOIN companies c ON c.id = db.company_id
            ${dateFrom ? sql`WHERE db.budget_date >= ${dateFrom}` : sql``}
            ${dateTo   ? sql`AND db.budget_date <= ${dateTo}`     : sql``}
            ORDER BY db.budget_date DESC, c.name ASC
            LIMIT 200
          `;
        } else {
          rows = await sql`
            SELECT db.*, c.name AS company_name
            FROM daily_budgets db
            JOIN companies c ON c.id = db.company_id
            WHERE db.company_id = ${parseInt(companyId)}
            ${dateFrom ? sql`AND db.budget_date >= ${dateFrom}` : sql``}
            ${dateTo   ? sql`AND db.budget_date <= ${dateTo}`   : sql``}
            ORDER BY db.budget_date DESC
            LIMIT 200
          `;
        }

        // For each row compute total_spent live from documents
        for (const row of rows) {
          const docs = await sql`
            SELECT amount FROM documents
            WHERE company_id = ${row.company_id}
              AND doc_date   = ${row.budget_date}
              AND menu_key IN ('itr','gst','office','vehicles','travel','advances','formalities')
          `;
          row.total_spent = docs.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
          row.total_available = (parseFloat(row.set_amount) || 0) + (parseFloat(row.carried_over_amount) || 0);
          row.remaining_amount = row.total_available - row.total_spent;
        }

        return res.status(200).json({ success: true, history: rows });
      }

      /* ── Mode 1: Today's live budget for a single company ── */
      let todayBudgets = await sql`
        SELECT * FROM daily_budgets
        WHERE company_id = ${parseInt(companyId)} AND budget_date = ${todayStr}
      `;

      let carriedOver = 0;
      if (todayBudgets.length === 0) {
        const prevBudgets = await sql`
          SELECT * FROM daily_budgets
          WHERE company_id = ${parseInt(companyId)} AND budget_date < ${todayStr}
          ORDER BY budget_date DESC LIMIT 1
        `;
        if (prevBudgets.length > 0) {
          carriedOver = parseFloat(prevBudgets[0].remaining_amount) || 0;
        }
      } else {
        carriedOver = parseFloat(todayBudgets[0].carried_over_amount) || 0;
      }

      const setAmount = todayBudgets.length > 0 ? parseFloat(todayBudgets[0].set_amount) : 0;

      const docsToday = await sql`
        SELECT amount FROM documents
        WHERE company_id = ${parseInt(companyId)}
          AND doc_date = ${todayStr}
          AND menu_key IN ('itr','gst','office','vehicles','travel','advances','formalities')
      `;

      let totalSpentToday = docsToday.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
      const totalAvailable  = setAmount + carriedOver;
      const remainingToday  = totalAvailable - totalSpentToday;

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

    /* =================================================================
       POST — Set / update today's budget for a company
    ================================================================= */
    if (req.method === "POST") {
      const { company_id, set_amount, budget_date, notes } = req.body || {};
      if (!company_id) return res.status(400).json({ error: "company_id is required" });

      const numCompId  = parseInt(company_id);
      const numSetAmt  = parseFloat(set_amount) || 0;
      const targetDate = budget_date || todayStr;
      const notesVal   = notes || "";

      // Previous day carryover (based on target date)
      const prevBudgets = await sql`
        SELECT * FROM daily_budgets
        WHERE company_id = ${numCompId} AND budget_date < ${targetDate}
        ORDER BY budget_date DESC LIMIT 1
      `;
      const carriedOver = prevBudgets.length > 0 ? (parseFloat(prevBudgets[0].remaining_amount) || 0) : 0;

      // Current spent on target date from documents
      const docs = await sql`
        SELECT amount FROM documents
        WHERE company_id = ${numCompId}
          AND doc_date = ${targetDate}
          AND menu_key IN ('itr','gst','office','vehicles','travel','advances','formalities')
      `;
      const totalSpent = docs.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
      const remaining  = (numSetAmt + carriedOver) - totalSpent;

      const result = await sql`
        INSERT INTO daily_budgets
          (company_id, budget_date, set_amount, carried_over_amount, total_spent, remaining_amount, notes)
        VALUES
          (${numCompId}, ${targetDate}, ${numSetAmt}, ${carriedOver}, ${totalSpent}, ${remaining}, ${notesVal})
        ON CONFLICT (company_id, budget_date)
        DO UPDATE SET
          set_amount           = EXCLUDED.set_amount,
          carried_over_amount  = EXCLUDED.carried_over_amount,
          total_spent          = EXCLUDED.total_spent,
          remaining_amount     = EXCLUDED.remaining_amount,
          notes                = EXCLUDED.notes
        RETURNING *
      `;

      return res.status(200).json({
        success: true,
        budget: { ...result[0], total_available: numSetAmt + carriedOver }
      });
    }

    /* =================================================================
       PUT — Edit an existing budget row by id (company admin / super admin)
    ================================================================= */
    if (req.method === "PUT") {
      const { id, set_amount, notes } = req.body || {};
      if (!id) return res.status(400).json({ error: "Budget entry id is required" });

      const numSetAmt = parseFloat(set_amount) || 0;
      const notesVal  = notes || "";

      // Fetch the existing row to recalculate remaining
      const existing = await sql`SELECT * FROM daily_budgets WHERE id = ${parseInt(id)}`;
      if (!existing.length) return res.status(404).json({ error: "Budget entry not found" });

      const row        = existing[0];
      const carriedOver = parseFloat(row.carried_over_amount) || 0;
      const totalSpent  = parseFloat(row.total_spent) || 0;
      const remaining   = (numSetAmt + carriedOver) - totalSpent;

      const updated = await sql`
        UPDATE daily_budgets
        SET set_amount = ${numSetAmt}, remaining_amount = ${remaining}, notes = ${notesVal}
        WHERE id = ${parseInt(id)}
        RETURNING *
      `;

      return res.status(200).json({ success: true, budget: updated[0] });
    }

    /* =================================================================
       DELETE — Remove a budget entry by id (super admin only enforced on frontend)
    ================================================================= */
    if (req.method === "DELETE") {
      const id = req.query.id || (req.body && req.body.id);
      if (!id) return res.status(400).json({ error: "Budget entry id is required" });

      await sql`DELETE FROM daily_budgets WHERE id = ${parseInt(id)}`;
      return res.status(200).json({ success: true, message: "Budget entry deleted" });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (error) {
    console.error("Budget API Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
