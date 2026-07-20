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
      const vehicles = await sql`
        SELECT * FROM vehicles
        WHERE company_id = ${companyId}
        ORDER BY id DESC
      `;

      return res.status(200).json({ success: true, vehicles });
    }

    if (req.method === "POST") {
      const { action, id, vehicle_name, rc_number, total_kms_driven, tax_paid_status, tax_amount, description, service_amount, service_date, document_id } = req.body || {};

      // Action: Log Service Update
      if (action === "update_service") {
        if (!id || total_kms_driven === undefined || !service_amount || !service_date) {
          return res.status(400).json({ error: "Vehicle ID, new KMs driven, service amount, and date are required" });
        }

        const newKms = parseInt(total_kms_driven);
        const sAmt = parseFloat(service_amount) || 0;

        // Update Vehicle record: total_kms_driven, set kms_at_last_service = newKms, last_service_date = service_date
        await sql`
          UPDATE vehicles
          SET
            total_kms_driven = ${newKms},
            kms_at_last_service = ${newKms},
            last_service_date = ${service_date}
          WHERE id = ${id}
        `;

        // Log Service History Entry
        await sql`
          INSERT INTO vehicle_service_logs (vehicle_id, service_date, service_amount, kms_driven, document_id)
          VALUES (${id}, ${service_date}, ${sAmt}, ${newKms}, ${document_id || null})
        `;

        return res.status(200).json({
          success: true,
          message: `Vehicle service updated successfully at ${newKms.toLocaleString()} km! Next service reminder set in 10,000 km.`,
          toast: `Service logged successfully for vehicle. Next service in 10,000 KMs.`
        });
      }

      // Add New Vehicle
      if (!vehicle_name || !rc_number) {
        return res.status(400).json({ error: "Vehicle Name and RC Number are required" });
      }

      const kms = parseInt(total_kms_driven) || 0;
      const tAmt = parseFloat(tax_amount) || 0;
      const tStatus = tax_paid_status || "Not Paid";
      const sDate = service_date || new Date().toISOString().split("T")[0];

      const newVeh = await sql`
        INSERT INTO vehicles (company_id, vehicle_name, rc_number, total_kms_driven, kms_at_last_service, tax_paid_status, tax_amount, description, last_service_date)
        VALUES (${companyId}, ${vehicle_name}, ${rc_number}, ${kms}, ${kms}, ${tStatus}, ${tAmt}, ${description || ''}, ${sDate})
        RETURNING *
      `;

      return res.status(201).json({ success: true, vehicle: newVeh[0] });
    }

    if (req.method === "DELETE") {
      const id = req.query.id || (req.body && req.body.id);
      if (!id) return res.status(400).json({ error: "Vehicle ID is required" });

      await sql`DELETE FROM vehicles WHERE id = ${id}`;
      return res.status(200).json({ success: true, message: "Vehicle deleted successfully" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Vehicle API Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
