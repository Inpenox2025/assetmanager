
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

      // Action: Log Service Only
      if (action === "update_service") {
        if (!id || !service_amount || !service_date) {
          return res.status(400).json({ error: "Vehicle ID, service amount, and date are required" });
        }

        const vehs = await sql`SELECT * FROM vehicles WHERE id = ${id}`;
        if (!vehs.length) return res.status(404).json({ error: "Vehicle not found" });
        const veh = vehs[0];
        const currentKms = veh.total_kms_driven || 0;
        const sAmt = parseFloat(service_amount) || 0;
        const filesArr = req.body.files || [];

        // Reset service baseline: set kms_at_last_service = currentKms, last_service_date = service_date
        await sql`
          UPDATE vehicles
          SET
            kms_at_last_service = ${currentKms},
            last_service_date = ${service_date}
          WHERE id = ${id}
        `;

        // Create document entry under 'vehicles' category 'Vehicle Service' so amount is deducted from daily budget
        const docRes = await sql`
          INSERT INTO documents (company_id, menu_key, category, amount, doc_date, metadata)
          VALUES (${companyId}, 'vehicles', 'Vehicle Service', ${sAmt}, ${service_date}, ${JSON.stringify({ vehicle_id: id, vehicle_name: veh.vehicle_name, rc_number: veh.rc_number, notes: description || '' })})
          RETURNING id
        `;

        const newDocId = docRes[0].id;
        for (const file of filesArr) {
          await sql`
            INSERT INTO document_files (document_id, file_name, file_type, file_size, file_data)
            VALUES (${newDocId}, ${file.name}, ${file.type || 'application/pdf'}, ${file.size || 0}, ${file.data})
          `;
        }

        // Log Service History Entry
        await sql`
          INSERT INTO vehicle_service_logs (vehicle_id, service_date, service_amount, kms_driven, document_id)
          VALUES (${id}, ${service_date}, ${sAmt}, ${currentKms}, ${newDocId})
        `;

        return res.status(200).json({
          success: true,
          message: `Vehicle service logged successfully for ₹ ${sAmt.toLocaleString()}! Service reminder reset to 10,000 KMs.`,
          toast: `Service logged successfully. Next service in 10,000 KMs.`
        });
      }

      // Action: Update Current Odometer KMs (Accumulates added reading or sets new total)
      if (action === "update_kms") {
        if (!id || total_kms_driven === undefined) {
          return res.status(400).json({ error: "Vehicle ID and KMs reading are required" });
        }

        const vehs = await sql`SELECT total_kms_driven FROM vehicles WHERE id = ${id}`;
        if (!vehs.length) return res.status(404).json({ error: "Vehicle not found" });

        const prevKms = parseInt(vehs[0].total_kms_driven || 0);
        const inputKms = parseInt(total_kms_driven) || 0;

        let newTotalKms = prevKms + inputKms;
        if (inputKms >= prevKms + inputKms) {
          newTotalKms = inputKms;
        }

        await sql`
          UPDATE vehicles
          SET total_kms_driven = ${newTotalKms}
          WHERE id = ${id}
        `;

        return res.status(200).json({
          success: true,
          message: `Odometer updated! Total KMs driven: ${newTotalKms.toLocaleString()} KM.`
        });
      }

      // Action: Reset Odometer Reading & Service Baseline
      if (action === "reset_odometer") {
        if (!id) return res.status(400).json({ error: "Vehicle ID is required" });

        const resetKms = parseInt(total_kms_driven || 0);

        await sql`
          UPDATE vehicles
          SET total_kms_driven = ${resetKms}, kms_at_last_service = ${resetKms}
          WHERE id = ${id}
        `;

        return res.status(200).json({
          success: true,
          message: `Odometer reset to ${resetKms.toLocaleString()} KM! Service baseline reset to ${resetKms.toLocaleString()} KM.`
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

      // kms_at_last_service initialized to 0 so created KMs count towards 10,000 KM threshold
      const newVeh = await sql`
        INSERT INTO vehicles (company_id, vehicle_name, rc_number, total_kms_driven, kms_at_last_service, tax_paid_status, tax_amount, description, last_service_date)
        VALUES (${companyId}, ${vehicle_name}, ${rc_number}, ${kms}, 0, ${tStatus}, ${tAmt}, ${description || ''}, ${sDate})
        RETURNING *
      `;

      return res.status(201).json({ success: true, vehicle: newVeh[0] });

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
