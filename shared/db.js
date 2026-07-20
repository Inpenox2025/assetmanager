const { neon } = require('@neondatabase/serverless');

// In-memory mock database store when DATABASE_URL is not set for local offline dev
const memoryStore = {
  companies: [
    { id: 1, name: 'Acme Corporation', gst_number: '29ABCDE1234F1Z5', logo_data: '', created_at: new Date().toISOString() },
    { id: 2, name: 'Apex Logistics Ltd', gst_number: '27AAAAA0000A1Z5', logo_data: '', created_at: new Date().toISOString() }
  ],
  daily_budgets: [],
  documents: [],
  document_files: [],
  employees: [],
  salary_payments: [],
  vehicles: [],
  vehicle_service_logs: []
};

let compIdCounter = 3;
let docIdCounter = 1;
let fileIdCounter = 1;
let empIdCounter = 1;
let vehIdCounter = 1;
let budgetIdCounter = 1;
let serviceIdCounter = 1;

function getMemorySQL() {
  return async function sql(strings, ...values) {
    const query = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? `$${i + 1}` : ''), '').trim();
    const upperQuery = query.toUpperCase();

    // Setup table creation queries (noop for memory store)
    if (upperQuery.startsWith('CREATE TABLE') || upperQuery.startsWith('ALTER TABLE')) {
      return [];
    }

    // COMPANIES
    if (query.includes('FROM companies') || query.includes('INTO companies')) {
      if (upperQuery.startsWith('SELECT')) {
        if (query.includes('WHERE id =')) {
          const id = parseInt(values[0]);
          return memoryStore.companies.filter(c => c.id === id);
        }
        return [...memoryStore.companies].sort((a,b) => b.id - a.id);
      }
      if (upperQuery.startsWith('INSERT INTO COMPANIES')) {
        const name = values[0];
        const gst = values[1];
        const logo = values[2] || '';
        const newComp = { id: compIdCounter++, name, gst_number: gst, logo_data: logo, created_at: new Date().toISOString() };
        memoryStore.companies.push(newComp);
        return [newComp];
      }
      if (upperQuery.startsWith('DELETE FROM COMPANIES')) {
        const id = parseInt(values[0]);
        memoryStore.companies = memoryStore.companies.filter(c => c.id !== id);
        return [];
      }
    }

    // DAILY BUDGETS
    if (query.includes('daily_budgets')) {
      if (upperQuery.startsWith('SELECT')) {
        const companyId = parseInt(values[0]);
        const dateStr = values[1];
        if (dateStr) {
          return memoryStore.daily_budgets.filter(b => b.company_id === companyId && b.budget_date === dateStr);
        }
        return memoryStore.daily_budgets.filter(b => b.company_id === companyId);
      }
      if (upperQuery.includes('INSERT INTO DAILY_BUDGETS') || upperQuery.includes('ON CONFLICT')) {
        const companyId = parseInt(values[0]);
        const bDate = values[1];
        const setAmt = parseFloat(values[2]) || 0;
        const carriedAmt = parseFloat(values[3]) || 0;
        const spentAmt = parseFloat(values[4]) || 0;
        const remAmt = parseFloat(values[5]) || (setAmt + carriedAmt - spentAmt);

        const existingIdx = memoryStore.daily_budgets.findIndex(b => b.company_id === companyId && b.budget_date === bDate);
        const record = { id: existingIdx >= 0 ? memoryStore.daily_budgets[existingIdx].id : budgetIdCounter++, company_id: companyId, budget_date: bDate, set_amount: setAmt, carried_over_amount: carriedAmt, total_spent: spentAmt, remaining_amount: remAmt, created_at: new Date().toISOString() };

        if (existingIdx >= 0) {
          memoryStore.daily_budgets[existingIdx] = record;
        } else {
          memoryStore.daily_budgets.push(record);
        }
        return [record];
      }
    }

    // DOCUMENTS
    if (query.includes('documents') || query.includes('document_files')) {
      if (upperQuery.startsWith('SELECT') && query.includes('document_files')) {
        const docId = parseInt(values[0]);
        return memoryStore.document_files.filter(f => f.document_id === docId);
      }
      if (upperQuery.startsWith('SELECT') && query.includes('FROM documents')) {
        const companyId = parseInt(values[0]);
        let filtered = memoryStore.documents.filter(d => d.company_id === companyId);
        const menuKey = values[1];
        if (menuKey) {
          filtered = filtered.filter(d => d.menu_key === menuKey);
        }
        return filtered.map(d => ({
          ...d,
          files: memoryStore.document_files.filter(f => f.document_id === d.id)
        })).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      }
      if (upperQuery.startsWith('INSERT INTO DOCUMENTS')) {
        const companyId = parseInt(values[0]);
        const menuKey = values[1];
        const category = values[2];
        const amount = parseFloat(values[3]) || 0;
        const docDate = values[4];
        const metadata = typeof values[5] === 'string' ? JSON.parse(values[5]) : (values[5] || {});

        const docRecord = {
          id: docIdCounter++,
          company_id: companyId,
          menu_key: menuKey,
          category: category,
          amount: amount,
          doc_date: docDate,
          metadata: metadata,
          created_at: new Date().toISOString()
        };
        memoryStore.documents.push(docRecord);
        return [docRecord];
      }
      if (upperQuery.startsWith('INSERT INTO DOCUMENT_FILES')) {
        const docId = parseInt(values[0]);
        const fileName = values[1];
        const fileType = values[2];
        const fileSize = parseInt(values[3]) || 0;
        const fileData = values[4];
        const fileRecord = {
          id: fileIdCounter++,
          document_id: docId,
          file_name: fileName,
          file_type: fileType,
          file_size: fileSize,
          file_data: fileData,
          created_at: new Date().toISOString()
        };
        memoryStore.document_files.push(fileRecord);
        return [fileRecord];
      }
      if (upperQuery.startsWith('DELETE FROM DOCUMENTS')) {
        const id = parseInt(values[0]);
        memoryStore.documents = memoryStore.documents.filter(d => d.id !== id);
        memoryStore.document_files = memoryStore.document_files.filter(f => f.document_id !== id);
        return [];
      }
      if (upperQuery.startsWith('UPDATE DOCUMENTS')) {
        const id = parseInt(values[0]);
        const amount = parseFloat(values[1]);
        const docDate = values[2];
        const idx = memoryStore.documents.findIndex(d => d.id === id);
        if (idx >= 0) {
          if (!isNaN(amount)) memoryStore.documents[idx].amount = amount;
          if (docDate) memoryStore.documents[idx].doc_date = docDate;
          return [memoryStore.documents[idx]];
        }
        return [];
      }
    }

    // EMPLOYEES & SALARY PAYMENTS
    if (query.includes('employees') || query.includes('salary_payments')) {
      if (upperQuery.startsWith('SELECT') && query.includes('FROM employees')) {
        const companyId = parseInt(values[0]);
        const emps = memoryStore.employees.filter(e => e.company_id === companyId);
        return emps.map(e => ({
          ...e,
          payments: memoryStore.salary_payments.filter(p => p.employee_id === e.id)
        })).sort((a,b) => b.id - a.id);
      }
      if (upperQuery.startsWith('INSERT INTO EMPLOYEES')) {
        const companyId = parseInt(values[0]);
        const name = values[1];
        const designation = values[2];
        const salary = parseFloat(values[3]) || 0;
        const email = values[4] || '';
        const phone = values[5] || '';
        const demographic = values[6] || '';
        const dateJoined = values[7];
        const isActive = values[8] !== undefined ? Boolean(values[8]) : true;

        const newEmp = {
          id: empIdCounter++,
          company_id: companyId,
          name,
          designation,
          salary,
          email,
          phone,
          demographic_details: demographic,
          date_joined: dateJoined,
          is_active: isActive,
          created_at: new Date().toISOString()
        };
        memoryStore.employees.push(newEmp);
        return [newEmp];
      }
      if (upperQuery.startsWith('UPDATE EMPLOYEES')) {
        const id = parseInt(values[0]);
        const idx = memoryStore.employees.findIndex(e => e.id === id);
        if (idx >= 0) {
          if (values[1] !== undefined) memoryStore.employees[idx].is_active = Boolean(values[1]);
          return [memoryStore.employees[idx]];
        }
        return [];
      }
      if (upperQuery.startsWith('DELETE FROM EMPLOYEES')) {
        const id = parseInt(values[0]);
        memoryStore.employees = memoryStore.employees.filter(e => e.id !== id);
        memoryStore.salary_payments = memoryStore.salary_payments.filter(p => p.employee_id !== id);
        return [];
      }
      if (upperQuery.includes('SALARY_PAYMENTS')) {
        const empId = parseInt(values[0]);
        const monthYear = values[1];
        const isPaid = Boolean(values[2]);
        const paidDate = values[3] || new Date().toISOString().split('T')[0];

        const existingIdx = memoryStore.salary_payments.findIndex(p => p.employee_id === empId && p.month_year === monthYear);
        const record = { id: existingIdx >= 0 ? memoryStore.salary_payments[existingIdx].id : Date.now(), employee_id: empId, month_year: monthYear, is_paid: isPaid, paid_date: paidDate };

        if (existingIdx >= 0) {
          memoryStore.salary_payments[existingIdx] = record;
        } else {
          memoryStore.salary_payments.push(record);
        }
        return [record];
      }
    }

    // VEHICLES & SERVICE LOGS
    if (query.includes('vehicles') || query.includes('vehicle_service_logs')) {
      if (upperQuery.startsWith('SELECT') && query.includes('FROM vehicles')) {
        const companyId = parseInt(values[0]);
        const vehs = memoryStore.vehicles.filter(v => v.company_id === companyId);
        return vehs.map(v => ({
          ...v,
          service_logs: memoryStore.vehicle_service_logs.filter(s => s.vehicle_id === v.id)
        })).sort((a,b) => b.id - a.id);
      }
      if (upperQuery.startsWith('INSERT INTO VEHICLES')) {
        const companyId = parseInt(values[0]);
        const vehicleName = values[1];
        const rcNumber = values[2];
        const kmsDriven = parseInt(values[3]) || 0;
        const taxStatus = values[4] || 'Not Paid';
        const taxAmount = parseFloat(values[5]) || 0;
        const description = values[6] || '';
        const lastServiceDate = values[7] || new Date().toISOString().split('T')[0];

        const newVeh = {
          id: vehIdCounter++,
          company_id: companyId,
          vehicle_name: vehicleName,
          rc_number: rcNumber,
          total_kms_driven: kmsDriven,
          kms_at_last_service: kmsDriven,
          tax_paid_status: taxStatus,
          tax_amount: taxAmount,
          description: description,
          last_service_date: lastServiceDate,
          created_at: new Date().toISOString()
        };
        memoryStore.vehicles.push(newVeh);
        return [newVeh];
      }
      if (upperQuery.startsWith('UPDATE VEHICLES')) {
        const id = parseInt(values[0]);
        const idx = memoryStore.vehicles.findIndex(v => v.id === id);
        if (idx >= 0) {
          if (values[1] !== undefined) memoryStore.vehicles[idx].total_kms_driven = parseInt(values[1]);
          if (values[2] !== undefined) memoryStore.vehicles[idx].kms_at_last_service = parseInt(values[2]);
          if (values[3] !== undefined) memoryStore.vehicles[idx].last_service_date = values[3];
          if (values[4] !== undefined) memoryStore.vehicles[idx].tax_paid_status = values[4];
          if (values[5] !== undefined) memoryStore.vehicles[idx].tax_amount = parseFloat(values[5]);
          return [memoryStore.vehicles[idx]];
        }
        return [];
      }
      if (upperQuery.startsWith('INSERT INTO VEHICLE_SERVICE_LOGS')) {
        const vehId = parseInt(values[0]);
        const sDate = values[1];
        const sAmount = parseFloat(values[2]) || 0;
        const kms = parseInt(values[3]) || 0;
        const docId = values[4] ? parseInt(values[4]) : null;

        const record = {
          id: serviceIdCounter++,
          vehicle_id: vehId,
          service_date: sDate,
          service_amount: sAmount,
          kms_driven: kms,
          document_id: docId,
          created_at: new Date().toISOString()
        };
        memoryStore.vehicle_service_logs.push(record);
        return [record];
      }
    }

    return [];
  };
}

function getSQL() {
  if (process.env.DATABASE_URL) {
    return neon(process.env.DATABASE_URL);
  }
  return getMemorySQL();
}

module.exports = { getSQL };
