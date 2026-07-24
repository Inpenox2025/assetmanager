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
         2. ?action=history&company_id= → date-wise history with filters
    ================================================================= */
    if (req.method === "GET") {
      const action    = req.query.action;
      const companyId = req.query.company_id;
      const dateFrom  = req.query.date_from || null;
      const dateTo    = req.query.date_to   || null;

      if (!companyId) return res.status(400).json({ error: "company_id is required" });

      /* ── Mode 2: Full history with optional filters ── */
      if (action === "history") {
        let rows;

        if (companyId === "all") {
          // Super admin — all companies, optional date range
          if (dateFrom && dateTo) {
            rows = await sql`
              SELECT db.*, c.name AS company_name
              FROM daily_budgets db
              JOIN companies c ON c.id = db.company_id
              WHERE db.budget_date >= ${dateFrom} AND db.budget_date <= ${dateTo}
              ORDER BY db.budget_date DESC, c.name ASC
              LIMIT 200
            `;
          } else if (dateFrom) {
            rows = await sql`
              SELECT db.*, c.name AS company_name
              FROM daily_budgets db
              JOIN companies c ON c.id = db.company_id
              WHERE db.budget_date >= ${dateFrom}
              ORDER BY db.budget_date DESC, c.name ASC
              LIMIT 200
            `;
          } else if (dateTo) {
            rows = await sql`
              SELECT db.*, c.name AS company_name
              FROM daily_budgets db
              JOIN companies c ON c.id = db.company_id
              WHERE db.budget_date <= ${dateTo}
              ORDER BY db.budget_date DESC, c.name ASC
              LIMIT 200
            `;
          } else {
            rows = await sql`
              SELECT db.*, c.name AS company_name
              FROM daily_budgets db
              JOIN companies c ON c.id = db.company_id
              ORDER BY db.budget_date DESC, c.name ASC
              LIMIT 200
            `;
          }
        } else {
          // Single company
          const numCompId = parseInt(companyId);
          if (dateFrom && dateTo) {
            rows = await sql`
              SELECT db.*, c.name AS company_name
              FROM daily_budgets db
              JOIN companies c ON c.id = db.company_id
              WHERE db.company_id = ${numCompId}
                AND db.budget_date >= ${dateFrom}
                AND db.budget_date <= ${dateTo}
              ORDER BY db.budget_date DESC
              LIMIT 200
            `;
          } else if (dateFrom) {
            rows = await sql`
              SELECT db.*, c.name AS company_name
              FROM daily_budgets db
              JOIN companies c ON c.id = db.company_id
              WHERE db.company_id = ${numCompId}
                AND db.budget_date >= ${dateFrom}
              ORDER BY db.budget_date DESC
              LIMIT 200
            `;
          } else if (dateTo) {
            rows = await sql`
              SELECT db.*, c.name AS company_name
              FROM daily_budgets db
              JOIN companies c ON c.id = db.company_id
              WHERE db.company_id = ${numCompId}
                AND db.budget_date <= ${dateTo}
              ORDER BY db.budget_date DESC
              LIMIT 200
            `;
          } else {
            rows = await sql`
              SELECT db.*, c.name AS company_name
              FROM daily_budgets db
              JOIN companies c ON c.id = db.company_id
              WHERE db.company_id = ${numCompId}
              ORDER BY db.budget_date DESC
              LIMIT 200
            `;
          }
        }

        // Compute live totals from documents for each row
        for (const row of rows) {
          const docs = await sql`
            SELECT amount FROM documents
            WHERE company_id = ${row.company_id}
              AND doc_date   = ${row.budget_date}
              AND (
                menu_key IN ('itr','gst','office','vehicles','travel','advances','formalities')
                OR (menu_key = 'bank' AND category IN ('EMI', 'Payment Receipts'))
              )
          `;
          row.total_spent     = docs.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
          row.total_available = (parseFloat(row.set_amount) || 0) + (parseFloat(row.carried_over_amount) || 0);
          row.remaining_amount = row.total_available - row.total_spent;
          if (row.notes === undefined) row.notes = "";
        }

        return res.status(200).json({ success: true, history: rows });
      }

      /* ── Mode 1: Today's live budget for a single company ── */
      const numCompId = parseInt(companyId);

      let todayBudgets = await sql`
        SELECT * FROM daily_budgets
        WHERE company_id = ${numCompId} AND budget_date = ${todayStr}
      `;

      let carriedOver = 0;
      if (todayBudgets.length === 0) {
        const prevBudgets = await sql`
          SELECT * FROM daily_budgets
          WHERE company_id = ${numCompId} AND budget_date < ${todayStr}
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
        WHERE company_id = ${numCompId}
          AND doc_date = ${todayStr}
          AND (
            menu_key IN ('itr','gst','office','vehicles','travel','advances','formalities')
            OR (menu_key = 'bank' AND category IN ('EMI', 'Payment Receipts'))
          )
      `;

      const totalSpentToday = docsToday.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
      const totalAvailable  = setAmount + carriedOver;
      const remainingToday  = totalAvailable - totalSpentToday;

      return res.status(200).json({
        success: true,
        budget: {
          company_id: numCompId,
          date: todayStr,
          set_amount: setAmount,
          carried_over_amount: carriedOver,
          total_available: totalAvailable,
          total_spent: totalSpentToday,
          remaining_amount: remainingToday,
          receipt_file_data: todayBudgets.length > 0 ? todayBudgets[0].receipt_file_data : null,
          receipt_file_name: todayBudgets.length > 0 ? todayBudgets[0].receipt_file_name : null
        }
      });
    }

    /* =================================================================
       POST — Set / update budget for a specific date
    ================================================================= */
    if (req.method === "POST") {
      const { company_id, set_amount, budget_date, notes, receipt_file_data, receipt_file_name } = req.body || {};
      if (!company_id) return res.status(400).json({ error: "company_id is required" });

      const numCompId  = parseInt(company_id);
      const numSetAmt  = parseFloat(set_amount) || 0;
      const targetDate = budget_date || todayStr;
      const notesVal   = notes || "";
      const rData      = receipt_file_data || null;
      const rName      = receipt_file_name || null;

      // Previous day carryover
      const prevBudgets = await sql`
        SELECT * FROM daily_budgets
        WHERE company_id = ${numCompId} AND budget_date < ${targetDate}
        ORDER BY budget_date DESC LIMIT 1
      `;
      const carriedOver = prevBudgets.length > 0 ? (parseFloat(prevBudgets[0].remaining_amount) || 0) : 0;

      // Docs spent on target date
      const docs = await sql`
        SELECT amount FROM documents
        WHERE company_id = ${numCompId}
          AND doc_date = ${targetDate}
          AND (
            menu_key IN ('itr','gst','office','vehicles','travel','advances','formalities')
            OR (menu_key = 'bank' AND category IN ('EMI', 'Payment Receipts'))
          )
      `;
      const totalSpent = docs.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
      const remaining  = (numSetAmt + carriedOver) - totalSpent;

      const result = await sql`
        INSERT INTO daily_budgets
          (company_id, budget_date, set_amount, carried_over_amount, total_spent, remaining_amount, notes, receipt_file_data, receipt_file_name)
        VALUES
          (${numCompId}, ${targetDate}, ${numSetAmt}, ${carriedOver}, ${totalSpent}, ${remaining}, ${notesVal}, ${rData}, ${rName})
        ON CONFLICT (company_id, budget_date)
        DO UPDATE SET
          set_amount          = EXCLUDED.set_amount,
          carried_over_amount = EXCLUDED.carried_over_amount,
          total_spent         = EXCLUDED.total_spent,
          remaining_amount    = EXCLUDED.remaining_amount,
          notes               = EXCLUDED.notes,
          receipt_file_data   = COALESCE(EXCLUDED.receipt_file_data, daily_budgets.receipt_file_data),
          receipt_file_name   = COALESCE(EXCLUDED.receipt_file_name, daily_budgets.receipt_file_name)
        RETURNING *
      `;

      return res.status(200).json({
        success: true,
        budget: { ...result[0], total_available: numSetAmt + carriedOver }
      });
    }

    /* =================================================================
       PUT — Edit an existing budget row by id
    ================================================================= */
    if (req.method === "PUT") {
      const { id, set_amount, notes, receipt_file_data, receipt_file_name } = req.body || {};
      if (!id) return res.status(400).json({ error: "Budget entry id is required" });

      const numSetAmt = parseFloat(set_amount) || 0;
      const notesVal  = notes || "";
      const rData     = receipt_file_data || null;
      const rName     = receipt_file_name || null;

      const existing = await sql`SELECT * FROM daily_budgets WHERE id = ${parseInt(id)}`;
      if (!existing.length) return res.status(404).json({ error: "Budget entry not found" });

      const row        = existing[0];
      const carriedOver = parseFloat(row.carried_over_amount) || 0;
      const totalSpent  = parseFloat(row.total_spent) || 0;
      const remaining   = (numSetAmt + carriedOver) - totalSpent;

      let updated;
      if (rData && rName) {
        updated = await sql`
          UPDATE daily_budgets
          SET set_amount = ${numSetAmt}, remaining_amount = ${remaining}, notes = ${notesVal}, receipt_file_data = ${rData}, receipt_file_name = ${rName}
          WHERE id = ${parseInt(id)}
          RETURNING *
        `;
      } else {
        updated = await sql`
          UPDATE daily_budgets
          SET set_amount = ${numSetAmt}, remaining_amount = ${remaining}, notes = ${notesVal}
          WHERE id = ${parseInt(id)}
          RETURNING *
        `;
      }

      return res.status(200).json({ success: true, budget: updated[0] });
    }

    /* =================================================================
       DELETE — Remove a budget entry by id (super admin enforced on frontend)
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
