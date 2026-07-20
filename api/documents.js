const { getSQL } = require("../shared/db");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const sql = getSQL();

  try {
    if (req.method === "GET") {
      const companyId = req.query.company_id || req.query.companyId;
      const menuKey = req.query.menu_key || req.query.menuKey;

      if (!companyId) {
        return res.status(400).json({ error: "Company ID is required" });
      }

      const documents = await sql`
        SELECT * FROM documents
        WHERE company_id = ${companyId}
        ${menuKey ? sql`AND menu_key = ${menuKey}` : sql``}
        ORDER BY created_at DESC
      `;

      return res.status(200).json({ success: true, documents });
    }

    if (req.method === "POST") {
      const { company_id, menu_key, category, amount, doc_date, metadata, files } = req.body || {};

      if (!company_id || !menu_key || !category || !doc_date) {
        return res.status(400).json({ error: "Missing required document fields (company_id, menu_key, category, doc_date)" });
      }

      const todayStr = new Date().toISOString().split("T")[0];
      if (doc_date < todayStr) {
        return res.status(400).json({ error: "Document date cannot be in the past. It must be today or a future date." });
      }

      const numAmount = parseFloat(amount) || 0.0;
      const metaObj = JSON.stringify(metadata || {});

      const docResult = await sql`
        INSERT INTO documents (company_id, menu_key, category, amount, doc_date, metadata)
        VALUES (${company_id}, ${menu_key}, ${category}, ${numAmount}, ${doc_date}, ${metaObj})
        RETURNING *
      `;
      const insertedDoc = docResult[0];

      const savedFiles = [];
      if (Array.isArray(files) && files.length > 0) {
        for (const file of files) {
          if (file.name && file.data) {
            const fResult = await sql`
              INSERT INTO document_files (document_id, file_name, file_type, file_size, file_data)
              VALUES (${insertedDoc.id}, ${file.name}, ${file.type || 'application/octet-stream'}, ${file.size || 0}, ${file.data})
              RETURNING *
            `;
            savedFiles.push(fResult[0]);
          }
        }
      }

      insertedDoc.files = savedFiles;
      return res.status(201).json({ success: true, document: insertedDoc });
    }

    if (req.method === "PUT") {
      const { id, category, amount, doc_date, metadata, files } = req.body || {};
      if (!id || !category || !doc_date) {
        return res.status(400).json({ error: "Document ID, Category, and Date are required" });
      }

      const numAmount = parseFloat(amount) || 0.0;
      const metaObj = JSON.stringify(metadata || {});

      const updated = await sql`
        UPDATE documents
        SET category = ${category}, amount = ${numAmount}, doc_date = ${doc_date}, metadata = ${metaObj}
        WHERE id = ${id}
        RETURNING *
      `;

      if (Array.isArray(files) && files.length > 0) {
        for (const file of files) {
          if (file.name && file.data) {
            await sql`
              INSERT INTO document_files (document_id, file_name, file_type, file_size, file_data)
              VALUES (${id}, ${file.name}, ${file.type || 'application/octet-stream'}, ${file.size || 0}, ${file.data})
            `;
          }
        }
      }

      return res.status(200).json({ success: true, document: updated[0] });
    }

    if (req.method === "DELETE") {
      const id = req.query.id || (req.body && req.body.id);
      if (!id) return res.status(400).json({ error: "Document ID is required" });

      await sql`DELETE FROM documents WHERE id = ${id}`;
      return res.status(200).json({ success: true, message: "Document deleted successfully" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Document API Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
