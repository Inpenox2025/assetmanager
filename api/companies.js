const { getSQL } = require("../shared/db");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const sql = getSQL();

  try {
    if (req.method === "GET") {
      const companies = await sql`SELECT * FROM companies ORDER BY id DESC`;
      return res.status(200).json({ success: true, companies });
    }

    if (req.method === "POST") {
      const { name, gst_number, logo_data } = req.body || {};
      if (!name || !gst_number) {
        return res.status(400).json({ error: "Company Name and GST Number are required" });
      }

      const result = await sql`
        INSERT INTO companies (name, gst_number, logo_data)
        VALUES (${name}, ${gst_number}, ${logo_data || ''})
        RETURNING *
      `;
      return res.status(201).json({ success: true, company: result[0] });
    }

    if (req.method === "DELETE") {
      const id = req.query.id || (req.body && req.body.id);
      if (!id) return res.status(400).json({ error: "Company ID is required" });

      await sql`DELETE FROM companies WHERE id = ${id}`;
      return res.status(200).json({ success: true, message: "Company deleted successfully" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Company API Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
