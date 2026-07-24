const { getSQL } = require("../shared/db");
const bcrypt = require("bcryptjs");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = getSQL();

    // 0. Users Table for Authentication & Super Admin Login
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'company_admin', -- 'super_admin', 'company_admin'
        company_id INT,
        email VARCHAR(255),
        last_login TIMESTAMP,
        last_login_ip VARCHAR(100),
        current_session_token TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Safely add missing columns to existing users table & expand token column to TEXT
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(100)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS current_session_token TEXT`;
    await sql`ALTER TABLE users ALTER COLUMN current_session_token TYPE TEXT`;

    // 0.1 Login Activities Tracking Table
    await sql`
      CREATE TABLE IF NOT EXISTS login_activities (
        id SERIAL PRIMARY KEY,
        user_id INT,
        username VARCHAR(100) NOT NULL,
        role VARCHAR(50) NOT NULL,
        company_name VARCHAR(255),
        ip_address VARCHAR(100),
        user_agent TEXT,
        status VARCHAR(50) NOT NULL,
        login_time TIMESTAMP DEFAULT NOW()
      )
    `;

    // Seed default Super Admin account if not existing
    const superAdminPasswordHash = await bcrypt.hash("inspenox2025", 10);
    await sql`
      INSERT INTO users (username, password_hash, role, email)
      VALUES ('superadmin', ${superAdminPasswordHash}, 'super_admin', 'admin@inducare.com')
      ON CONFLICT (username) DO NOTHING
    `;

    // 1. Companies Table
    await sql`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        gst_number VARCHAR(50) NOT NULL,
        logo_data TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Seed default Companies if empty
    await sql`
      INSERT INTO companies (name, gst_number)
      VALUES ('Acme Corporation', '29ABCDE1234F1Z5'), ('Apex Logistics Ltd', '27AAAAA0000A1Z5')
      ON CONFLICT DO NOTHING
    `;

    // 2. Daily Budgets Table
    await sql`
      CREATE TABLE IF NOT EXISTS daily_budgets (
        id SERIAL PRIMARY KEY,
        company_id INT REFERENCES companies(id) ON DELETE CASCADE,
        budget_date DATE NOT NULL,
        set_amount DECIMAL(12,2) DEFAULT 0.00,
        carried_over_amount DECIMAL(12,2) DEFAULT 0.00,
        total_spent DECIMAL(12,2) DEFAULT 0.00,
        remaining_amount DECIMAL(12,2) DEFAULT 0.00,
        notes TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT company_date_uniq UNIQUE(company_id, budget_date)
      )
    `;
    // Safely add notes & receipt columns to existing daily_budgets table
    await sql`ALTER TABLE daily_budgets ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`;
    await sql`ALTER TABLE daily_budgets ADD COLUMN IF NOT EXISTS receipt_file_data TEXT`;
    await sql`ALTER TABLE daily_budgets ADD COLUMN IF NOT EXISTS receipt_file_name VARCHAR(255)`;

    // 3. Documents Table
    await sql`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        company_id INT REFERENCES companies(id) ON DELETE CASCADE,
        menu_key VARCHAR(50) NOT NULL,
        category VARCHAR(100) NOT NULL,
        amount DECIMAL(12,2) DEFAULT 0.00,
        doc_date DATE NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // 4. Document Files Table
    await sql`
      CREATE TABLE IF NOT EXISTS document_files (
        id SERIAL PRIMARY KEY,
        document_id INT REFERENCES documents(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(100) NOT NULL,
        file_size INT NOT NULL,
        file_data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // 5. Employees Table
    await sql`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        company_id INT REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        designation VARCHAR(100) NOT NULL,
        salary DECIMAL(12,2) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        demographic_details TEXT,
        date_joined DATE NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        pf_amount DECIMAL(12,2) DEFAULT 0.00,
        hra_amount DECIMAL(12,2) DEFAULT 0.00,
        esi_amount DECIMAL(12,2) DEFAULT 0.00,
        insurance_amount DECIMAL(12,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Safely add missing columns to existing employees table
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS pf_amount DECIMAL(12,2) DEFAULT 0.00`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS hra_amount DECIMAL(12,2) DEFAULT 0.00`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS esi_amount DECIMAL(12,2) DEFAULT 0.00`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS insurance_amount DECIMAL(12,2) DEFAULT 0.00`;

    // 6. Salary Payments Table
    await sql`
      CREATE TABLE IF NOT EXISTS salary_payments (
        id SERIAL PRIMARY KEY,
        employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
        month_year VARCHAR(7) NOT NULL,
        is_paid BOOLEAN DEFAULT FALSE,
        paid_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT emp_month_uniq UNIQUE(employee_id, month_year)
      )
    `;

    // 7. Vehicles Table
    await sql`
      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        company_id INT REFERENCES companies(id) ON DELETE CASCADE,
        vehicle_name VARCHAR(255) NOT NULL,
        rc_number VARCHAR(100) NOT NULL,
        total_kms_driven INT DEFAULT 0,
        kms_at_last_service INT DEFAULT 0,
        tax_paid_status VARCHAR(20) DEFAULT 'Not Paid',
        tax_amount DECIMAL(12,2) DEFAULT 0.00,
        description TEXT,
        last_service_date DATE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // 8. Vehicle Service Logs Table
    await sql`
      CREATE TABLE IF NOT EXISTS vehicle_service_logs (
        id SERIAL PRIMARY KEY,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
        service_date DATE NOT NULL,
        service_amount DECIMAL(12,2) NOT NULL,
        kms_driven INT NOT NULL,
        document_id INT REFERENCES documents(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    return res.status(200).json({
      success: true,
      message: "Database tables and Super Admin credentials initialized successfully!",
      default_credentials: { username: "superadmin", password: "admin123" }
    });
  } catch (error) {
    console.error("Setup Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
