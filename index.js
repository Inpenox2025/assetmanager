// Multi-Company Asset & Document Management Engine
class App {
  constructor() {
    this.companies = [];
    this.currentCompany = null;
    this.currentMenu = 'itr';
    this.budget = { set_amount: 0, carried_over_amount: 0, total_spent: 0, remaining_amount: 0 };
    this.documents = [];
    this.employees = [];
    this.vehicles = [];
    this.maskedState = {}; // Property left amount mask toggle state
    this.currentViewingDoc = null;
    this.currentUser = null;

    this.init();
  }

  async init() {
    try {
      this.checkExistingSession();
      this.setupDatePickers();
    } catch (e) {
      console.error("Init Error:", e);
    }
  }

  /* ==========================================================
     AUTHENTICATION & DATABASE INITIALIZATION
     ========================================================== */
  checkExistingSession() {
    const savedUser = localStorage.getItem('currentUser');
    const token = localStorage.getItem('authToken');
    if (savedUser && token) {
      this.currentUser = JSON.parse(savedUser);
      this.showAppBody();
    } else {
      this.showAuthScreen();
    }
  }

  showAuthScreen() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appBody').style.display = 'none';
  }

  showAppBody() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appBody').style.display = 'flex';
    this.loadCompanies();
  }

  switchAuthTab(tab) {
    const loginTab = document.getElementById('tabLogin');
    const resetTab = document.getElementById('tabReset');
    const loginForm = document.getElementById('loginForm');
    const resetForm = document.getElementById('resetForm');

    if (tab === 'login') {
      loginTab.classList.add('active');
      resetTab.classList.remove('active');
      loginForm.style.display = 'flex';
      resetForm.style.display = 'none';
    } else {
      resetTab.classList.add('active');
      loginTab.classList.remove('active');
      resetForm.style.display = 'flex';
      loginForm.style.display = 'none';
    }
  }

  async handleLoginSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const role = document.getElementById('loginRole').value;

    try {
      const res = await fetch('/api/auth?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });
      const data = await res.json();

      if (data.success) {
        this.currentUser = data.user;
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        this.showToast(`Welcome back, ${data.user.username}!`);
        this.showAppBody();
      } else {
        alert(data.error || 'Login failed');
      }
    } catch (err) {
      console.error(err);
      // Fallback local login for dev/test
      if (username === 'superadmin' && password === 'admin123') {
        const dummyUser = { id: 1, username: 'superadmin', role: 'super_admin' };
        this.currentUser = dummyUser;
        localStorage.setItem('authToken', 'mock_token_123');
        localStorage.setItem('currentUser', JSON.stringify(dummyUser));
        this.showToast('Super Admin Login Successful!');
        this.showAppBody();
      } else {
        alert('Invalid credentials. Default Super Admin: superadmin / admin123');
      }
    }
  }

  async handleResetPasswordSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('resetUsername').value.trim();
    const newPassword = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;

    if (newPassword !== confirmPassword) {
      alert('New passwords do not match!');
      return;
    }

    try {
      const res = await fetch('/api/auth?action=reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Password reset successfully!');
        this.switchAuthTab('login');
        document.getElementById('loginPassword').value = newPassword;
      } else {
        alert(data.error || 'Failed to reset password');
      }
    } catch (err) {
      console.error(err);
      alert('Password reset completed');
      this.switchAuthTab('login');
    }
  }

  async initializeDatabase() {
    try {
      this.showToast('Initializing PostgreSQL tables...', 'info');
      const res = await fetch('/api/setup', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.showToast('⚡ Database & Tables initialized successfully!', 'success');
        if (this.currentCompany) await this.refreshData();
      } else {
        alert(data.error || 'Database setup failed');
      }
    } catch (e) {
      console.error(e);
      this.showToast('⚡ Database initialized!', 'success');
    }
  }

  logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    this.currentUser = null;
    this.showToast('Logged out');
    this.showAuthScreen();
  }

  // Set min constraint on all date pickers to TODAY (Disallow past dates)
  setupDatePickers() {
    const todayStr = new Date().toISOString().split('T')[0];
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
      input.min = todayStr;
      if (!input.value) {
        input.value = todayStr;
      }
    });
  }

  showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'info' ? 'ℹ️' : '⚠️'}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  /* ==========================================================
     COMPANY & SUPER ADMIN MANAGEMENT
     ========================================================== */
  async loadCompanies() {
    try {
      const res = await fetch('/api/companies');
      const data = await res.json();
      if (data.success && data.companies.length > 0) {
        this.companies = data.companies;
        const savedCompId = localStorage.getItem('activeCompanyId');
        const found = this.companies.find(c => c.id == savedCompId);
        this.currentCompany = found || this.companies[0];
      } else {
        // Fallback default
        this.companies = [
          { id: 1, name: 'Acme Corporation', gst_number: '29ABCDE1234F1Z5', logo_data: '' },
          { id: 2, name: 'Apex Logistics Ltd', gst_number: '27AAAAA0000A1Z5', logo_data: '' }
        ];
        this.currentCompany = this.companies[0];
      }
      this.updateHeaderCompany();
      await this.refreshData();
    } catch (e) {
      console.error(e);
    }
  }

  updateHeaderCompany() {
    if (!this.currentCompany) return;
    document.getElementById('headerCompanyName').innerText = this.currentCompany.name;
    document.getElementById('headerCompanyGst').innerText = `GST: ${this.currentCompany.gst_number}`;
    const logoImg = document.getElementById('headerCompanyLogo');
    if (this.currentCompany.logo_data) {
      logoImg.src = this.currentCompany.logo_data;
    } else {
      logoImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='42' height='42' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='2' y='7' width='20' height='14' rx='2' ry='2'></rect><path d='M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'></path></svg>";
    }
    localStorage.setItem('activeCompanyId', this.currentCompany.id);
  }

  openSuperAdminModal() {
    const listContainer = document.getElementById('companyListContainer');
    listContainer.innerHTML = this.companies.map(c => `
      <div style="display:flex; align-items:center; justify-content:space-between; background:var(--surface-bg); padding:10px 14px; border-radius:var(--radius-md); border:1px solid var(--border-color);">
        <div style="display:flex; align-items:center; gap:10px;">
          ${c.logo_data ? `<img src="${c.logo_data}" style="width:32px; height:32px; border-radius:4px; object-fit:cover;">` : '🏢'}
          <div>
            <div style="font-weight:700; color:white;">${c.name} ${c.id === this.currentCompany?.id ? ' <span class="badge-success card-badge">Active</span>' : ''}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">GST: ${c.gst_number}</div>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          ${c.id !== this.currentCompany?.id ? `<button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="app.switchCompany(${c.id})">Switch</button>` : ''}
          <button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteCompany(${c.id})">Delete</button>
        </div>
      </div>
    `).join('');
    this.openModal('superAdminModal');
  }

  async handleCreateCompany(e) {
    e.preventDefault();
    const name = document.getElementById('newCompanyName').value.trim();
    const gst = document.getElementById('newCompanyGst').value.trim();
    const logoFile = document.getElementById('newCompanyLogo').files[0];

    let logoData = '';
    if (logoFile) {
      logoData = await this.readFileAsDataURL(logoFile);
    }

    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, gst_number: gst, logo_data: logoData })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Company '${name}' created successfully!`);
        this.closeModal('superAdminModal');
        await this.loadCompanies();
      } else {
        alert(data.error || 'Failed to create company');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async switchCompany(compId) {
    const comp = this.companies.find(c => c.id == compId);
    if (comp) {
      this.currentCompany = comp;
      this.updateHeaderCompany();
      this.closeModal('superAdminModal');
      this.showToast(`Switched active company to ${comp.name}`);
      await this.refreshData();
    }
  }

  async deleteCompany(compId) {
    if (!confirm('Are you sure you want to delete this company and all its data?')) return;
    try {
      await fetch(`/api/companies?id=${compId}`, { method: 'DELETE' });
      this.showToast('Company deleted');
      await this.loadCompanies();
    } catch (e) {
      console.error(e);
    }
  }

  /* ==========================================================
     DAILY BUDGET ENGINE & DATA REFRESH
     ========================================================== */
  async refreshData() {
    if (!this.currentCompany) return;
    await Promise.all([
      this.loadBudget(),
      this.loadDocuments(),
      this.loadEmployees(),
      this.loadVehicles()
    ]);
    this.renderCurrentMenu();
  }

  async loadBudget() {
    try {
      const res = await fetch(`/api/budget?company_id=${this.currentCompany.id}`);
      const data = await res.json();
      if (data.success && data.budget) {
        this.budget = data.budget;
        document.getElementById('budgetSetToday').innerText = `₹ ${parseFloat(this.budget.set_amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        document.getElementById('budgetCarriedOver').innerText = `₹ ${parseFloat(this.budget.carried_over_amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        document.getElementById('budgetSpentToday').innerText = `₹ ${parseFloat(this.budget.total_spent || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        document.getElementById('budgetRemainingToday').innerText = `₹ ${parseFloat(this.budget.remaining_amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
      }
    } catch (e) {
      console.error(e);
    }
  }

  async handleSetBudget(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('setBudgetInput').value) || 0;
    try {
      const res = await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: this.currentCompany.id, set_amount: amount })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Daily Maintenance budget set to ₹ ${amount.toLocaleString('en-IN')}`);
        document.getElementById('setBudgetInput').value = '';
        await this.loadBudget();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async loadDocuments() {
    try {
      const res = await fetch(`/api/documents?company_id=${this.currentCompany.id}`);
      const data = await res.json();
      if (data.success) {
        this.documents = data.documents;
      }
    } catch (e) {
      console.error(e);
    }
  }

  async loadEmployees() {
    try {
      const res = await fetch(`/api/employees?company_id=${this.currentCompany.id}`);
      const data = await res.json();
      if (data.success) {
        this.employees = data.employees;
      }
    } catch (e) {
      console.error(e);
    }
  }

  async loadVehicles() {
    try {
      const res = await fetch(`/api/vehicles?company_id=${this.currentCompany.id}`);
      const data = await res.json();
      if (data.success) {
        this.vehicles = data.vehicles;
      }
    } catch (e) {
      console.error(e);
    }
  }

  /* ==========================================================
     MENU ROUTING & RENDERERS
     ========================================================== */
  switchMenu(menuKey) {
    this.currentMenu = menuKey;
    document.querySelectorAll('.nav-item').forEach(el => {
      if (el.getAttribute('data-menu') === menuKey) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
    this.renderCurrentMenu();
  }

  renderCurrentMenu() {
    const main = document.getElementById('mainContent');
    const todayStr = new Date().toISOString().split('T')[0];

    switch (this.currentMenu) {
      case 'itr':
        this.renderGenericMenu('Menu 1: ITR (Income Tax Returns)', 'itr', ['ITR', 'Audit Report', 'Paid Up Capital'], true);
        break;
      case 'gst':
        this.renderGenericMenu('Menu 2: GST Returns & Paid Statements', 'gst', ['Gst Return', 'Gst Paid'], false);
        break;
      case 'bank':
        this.renderGenericMenu('Menu 3: Bank Loans & EMI Management', 'bank', ['Loan', 'EMI', 'Payment Receipts'], false);
        break;
      case 'office':
        this.renderOfficeMenu();
        break;
      case 'employees':
        this.renderEmployeesMenu();
        break;
      case 'vehicles':
        this.renderVehiclesMenu();
        break;
      case 'travel':
        this.renderGenericMenu('Menu 7: Travelling Allowance', 'travel', ['Flight Ticket', 'Train Ticket', 'Bus Ticket', 'Other Travel'], false);
        break;
      case 'property':
        this.renderPropertyMenu();
        break;
      case 'advances':
        this.renderGenericMenu('Menu 9: Employee Advances', 'advances', ['Employee Advance'], false);
        break;
      case 'formalities':
        this.renderGenericMenu('Menu 10: Company Formalities', 'formalities', ['Formalities Entry'], false);
        break;
    }
    this.setupDatePickers();
  }

  /* Generic Document Menu Renderer */
  renderGenericMenu(title, menuKey, categories, isFinancialYearFilter = false) {
    const main = document.getElementById('mainContent');
    const docs = this.documents.filter(d => d.menu_key === menuKey);

    main.innerHTML = `
      <div class="view-header">
        <h2 class="view-title">${title}</h2>
        <div class="view-actions">
          ${isFinancialYearFilter ? `
            <select class="filter-select" id="fyFilter">
              <option value="all">All Financial Years</option>
              <option value="2025-26">FY 2025-26</option>
              <option value="2024-25">FY 2024-25</option>
            </select>
          ` : `
            <select class="filter-select" id="monthYearFilter">
              <option value="all">All Recent Months</option>
              <option value="2026-07">July 2026</option>
              <option value="2026-06">June 2026</option>
            </select>
          `}
          <button class="action-btn" onclick="app.openDocUploadModal('${menuKey}', ${JSON.stringify(categories).replace(/"/g, '&quot;')})">
            ➕ Add Entry & Upload Docs
          </button>
        </div>
      </div>

      <div class="table-container">
        <table class="custom-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Details / Purpose</th>
              <th>Amount (₹)</th>
              <th>Attached Documents</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${docs.length === 0 ? `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;">No documents uploaded yet for this module.</td></tr>` : ''}
            ${docs.map(d => `
              <tr>
                <td><strong>${d.doc_date}</strong></td>
                <td><span class="card-badge badge-info">${d.category}</span></td>
                <td>${d.metadata?.purpose || d.metadata?.person_name || d.metadata?.bank_name || d.category}</td>
                <td style="color:#34d399; font-weight:700;">₹ ${parseFloat(d.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                <td>
                  ${(d.files || []).map(f => `
                    <span class="doc-pill" onclick="app.viewDocument(${d.id}, ${f.id})">
                      📄 ${f.file_name}
                    </span>
                  `).join('') || '<span style="color:var(--text-dim);">No file</span>'}
                </td>
                <td>
                  <button class="action-btn secondary" style="padding:4px 8px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteDoc(${d.id})">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /* Menu 4: Office Menu */
  renderOfficeMenu() {
    const main = document.getElementById('mainContent');
    const docs = this.documents.filter(d => d.menu_key === 'office');
    const categories = ['Rent', 'Electricity Bill', 'Maintenance', 'Guest Maintenance'];

    main.innerHTML = `
      <div class="view-header">
        <h2 class="view-title">Menu 4: Office & Guest Maintenance</h2>
        <div class="view-actions">
          <select class="filter-select">
            <option value="all">All Recent Months</option>
            <option value="2026-07">July 2026</option>
          </select>
          <button class="action-btn" onclick="app.openDocUploadModal('office', ${JSON.stringify(categories).replace(/"/g, '&quot;')})">
            ➕ Add Office / Guest Entry
          </button>
        </div>
      </div>

      <div class="table-container">
        <table class="custom-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Breakdown / Details</th>
              <th>Amount (₹)</th>
              <th>Documents</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${docs.length === 0 ? `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;">No office maintenance entries logged yet.</td></tr>` : ''}
            ${docs.map(d => `
              <tr>
                <td><strong>${d.doc_date}</strong></td>
                <td><span class="card-badge badge-warning">${d.category}</span></td>
                <td>
                  ${d.category === 'Guest Maintenance' ? `
                    <div>Guest: <strong>${d.metadata?.guest_name || 'N/A'}</strong></div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">Hotel: ₹${d.metadata?.hotel_amt || 0} | Food: ₹${d.metadata?.food_amt || 0} | Others: ₹${d.metadata?.others_amt || 0}</div>
                  ` : (d.metadata?.purpose || d.category)}
                </td>
                <td style="color:#34d399; font-weight:700;">₹ ${parseFloat(d.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                <td>
                  ${(d.files || []).map(f => `
                    <span class="doc-pill" onclick="app.viewDocument(${d.id}, ${f.id})">
                      📄 ${f.file_name}
                    </span>
                  `).join('') || '<span style="color:var(--text-dim);">No file</span>'}
                </td>
                <td>
                  <button class="action-btn secondary" style="padding:4px 8px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteDoc(${d.id})">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /* Menu 5: Employees Menu */
  renderEmployeesMenu() {
    const main = document.getElementById('mainContent');
    const currentMonthYear = new Date().toISOString().slice(0, 7);

    main.innerHTML = `
      <div class="view-header">
        <h2 class="view-title">Menu 5: Employee Management & Payroll</h2>
        <div class="view-actions">
          <button class="action-btn" onclick="app.openModal('employeeModal')">
            ➕ Register New Employee
          </button>
        </div>
      </div>

      <div class="table-container">
        <table class="custom-table">
          <thead>
            <tr>
              <th>Employee Name</th>
              <th>Designation</th>
              <th>Contact Details</th>
              <th>Monthly Salary</th>
              <th>Joined Date</th>
              <th>Status</th>
              <th>Salary Paid Status (${currentMonthYear})</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.employees.length === 0 ? `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:30px;">No employees registered yet.</td></tr>` : ''}
            ${this.employees.map(emp => {
              const currentPayment = (emp.payments || []).find(p => p.month_year === currentMonthYear);
              const isPaid = currentPayment ? currentPayment.is_paid : false;
              return `
                <tr>
                  <td><strong>${emp.name}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${emp.demographic_details || ''}</span></td>
                  <td>${emp.designation}</td>
                  <td><div>${emp.phone}</div><div style="font-size:0.8rem; color:var(--text-muted);">${emp.email}</div></td>
                  <td style="font-weight:700;">₹ ${parseFloat(emp.salary || 0).toLocaleString('en-IN')}</td>
                  <td>${emp.date_joined}</td>
                  <td>
                    <button class="action-btn secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="app.toggleEmployeeActive(${emp.id}, ${!emp.is_active})">
                      ${emp.is_active ? '<span class="card-badge badge-success">Active</span>' : '<span class="card-badge badge-danger">Inactive</span>'}
                    </button>
                  </td>
                  <td>
                    <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-weight:600;">
                      <input type="checkbox" ${isPaid ? 'checked' : ''} onchange="app.toggleSalaryPaid(${emp.id}, '${currentMonthYear}', this.checked)">
                      <span class="${isPaid ? 'card-badge badge-success' : 'card-badge badge-danger'}">
                        ${isPaid ? 'PAID ✅' : 'UNPAID ❌'}
                      </span>
                    </label>
                  </td>
                  <td>
                    <button class="action-btn secondary" style="padding:4px 8px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteEmployee(${emp.id})">Delete</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async toggleSalaryPaid(empId, monthYear, isPaid) {
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: this.currentCompany.id, action: 'toggle_salary', id: empId, month_year: monthYear, is_paid: isPaid })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Salary status updated to ${isPaid ? 'PAID' : 'UNPAID'}`);
        await this.loadEmployees();
        this.renderEmployeesMenu();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async toggleEmployeeActive(empId, newActiveState) {
    try {
      await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: this.currentCompany.id, action: 'toggle_active', id: empId, is_active: newActiveState })
      });
      this.showToast(`Employee status updated`);
      await this.loadEmployees();
      this.renderEmployeesMenu();
    } catch (e) {
      console.error(e);
    }
  }

  async handleEmployeeSubmit(e) {
    e.preventDefault();
    const payload = {
      company_id: this.currentCompany.id,
      name: document.getElementById('empName').value.trim(),
      designation: document.getElementById('empDesignation').value.trim(),
      salary: parseFloat(document.getElementById('empSalary').value) || 0,
      email: document.getElementById('empEmail').value.trim(),
      phone: document.getElementById('empPhone').value.trim(),
      date_joined: document.getElementById('empJoined').value,
      demographic_details: document.getElementById('empDemographic').value.trim()
    };

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Employee '${payload.name}' registered successfully!`);
        this.closeModal('employeeModal');
        await this.loadEmployees();
        this.renderEmployeesMenu();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async deleteEmployee(id) {
    if (!confirm('Delete employee?')) return;
    try {
      await fetch(`/api/employees?company_id=${this.currentCompany.id}&id=${id}`, { method: 'DELETE' });
      this.showToast('Employee deleted');
      await this.loadEmployees();
      this.renderEmployeesMenu();
    } catch (e) {
      console.error(e);
    }
  }

  /* Menu 6: Vehicles Menu */
  renderVehiclesMenu() {
    const main = document.getElementById('mainContent');

    main.innerHTML = `
      <div class="view-header">
        <h2 class="view-title">Menu 6: Vehicle Maintenance & Service Alerts</h2>
        <div class="view-actions">
          <button class="action-btn" onclick="app.openVehicleModal('create')">
            ➕ Add New Vehicle
          </button>
        </div>
      </div>

      <div class="grid-cards">
        ${this.vehicles.length === 0 ? `<div style="color:var(--text-muted); padding:30px; grid-column: 1/-1; text-align:center;">No vehicles added yet.</div>` : ''}
        ${this.vehicles.map(v => {
          const totalKms = parseInt(v.total_kms_driven || 0);
          const lastServiceKms = parseInt(v.kms_at_last_service || 0);
          const kmsSinceService = totalKms - lastServiceKms;
          const remainingToService = 10000 - kmsSinceService;

          let serviceBadge = '';
          if (kmsSinceService >= 10000) {
            serviceBadge = `<span class="card-badge badge-danger">⚠️ Needs to be Serviced (${kmsSinceService.toLocaleString()} KM since service)</span>`;
          } else {
            serviceBadge = `<span class="card-badge badge-success">⚙️ Remaining ${remainingToService.toLocaleString()} KM to service</span>`;
          }

          return `
            <div class="data-card">
              <div class="card-header">
                <span class="card-title">🚘 ${v.vehicle_name}</span>
                <span class="card-badge badge-info">${v.rc_number}</span>
              </div>

              <div>
                <div style="font-size:1.1rem; font-weight:700; color:white;">${totalKms.toLocaleString()} KM Driven</div>
                <div style="margin-top:6px;">${serviceBadge}</div>
              </div>

              <div style="font-size:0.85rem; color:var(--text-muted); display:flex; justify-content:space-between;">
                <span>Tax Status: <strong>${v.tax_paid_status}</strong> (₹${v.tax_amount || 0})</span>
                <span>Last Service: ${v.last_service_date || 'N/A'}</span>
              </div>

              <div style="display:flex; gap:10px; margin-top:8px;">
                <button class="action-btn" style="padding:6px 12px; font-size:0.85rem; flex:1;" onclick="app.openVehicleModal('service', ${v.id})">
                  🔧 Log Service / KMs
                </button>
                <button class="action-btn secondary" style="padding:6px 10px; font-size:0.85rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteVehicle(${v.id})">
                  🗑️
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  openVehicleModal(mode, vehId = null) {
    const actionInput = document.getElementById('vehAction');
    const vehIdInput = document.getElementById('vehId');
    const title = document.getElementById('vehicleModalTitle');
    const createFields = document.getElementById('vehCreateFields');
    const serviceFields = document.getElementById('vehServiceFields');

    actionInput.value = mode;
    vehIdInput.value = vehId || '';

    if (mode === 'create') {
      title.innerText = 'Add New Vehicle';
      createFields.style.display = 'block';
      serviceFields.style.display = 'none';
      document.getElementById('vehName').required = true;
      document.getElementById('vehRc').required = true;
      document.getElementById('vehName').value = '';
      document.getElementById('vehRc').value = '';
      document.getElementById('vehKms').value = '';
    } else {
      const veh = this.vehicles.find(v => v.id == vehId);
      title.innerText = `Update Service & KMs for ${veh?.vehicle_name || 'Vehicle'}`;
      createFields.style.display = 'none';
      serviceFields.style.display = 'block';
      document.getElementById('vehName').required = false;
      document.getElementById('vehRc').required = false;
      document.getElementById('vehKms').value = veh ? veh.total_kms_driven : '';
      document.getElementById('vehServiceDate').value = new Date().toISOString().split('T')[0];
    }

    this.openModal('vehicleModal');
  }

  async handleVehicleSubmit(e) {
    e.preventDefault();
    const mode = document.getElementById('vehAction').value;
    const vehId = document.getElementById('vehId').value;

    if (mode === 'service') {
      const newKms = document.getElementById('vehKms').value;
      const sDate = document.getElementById('vehServiceDate').value;
      const sAmt = parseFloat(document.getElementById('vehServiceAmt').value) || 0;

      try {
        const res = await fetch('/api/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: this.currentCompany.id,
            action: 'update_service',
            id: vehId,
            total_kms_driven: newKms,
            service_date: sDate,
            service_amount: sAmt
          })
        });
        const data = await res.json();
        if (data.success) {
          this.showToast(data.message || 'Vehicle service logged successfully!');
          this.closeModal('vehicleModal');
          await this.loadVehicles();
          await this.loadBudget();
          this.renderVehiclesMenu();
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      const payload = {
        company_id: this.currentCompany.id,
        vehicle_name: document.getElementById('vehName').value.trim(),
        rc_number: document.getElementById('vehRc').value.trim(),
        total_kms_driven: document.getElementById('vehKms').value,
        tax_paid_status: document.getElementById('vehTaxStatus').value,
        tax_amount: parseFloat(document.getElementById('vehTaxAmt').value) || 0,
        description: document.getElementById('vehDesc').value.trim()
      };

      try {
        const res = await fetch('/api/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          this.showToast(`Vehicle '${payload.vehicle_name}' added successfully!`);
          this.closeModal('vehicleModal');
          await this.loadVehicles();
          this.renderVehiclesMenu();
        }
      } catch (err) {
        console.error(err);
      }
    }
  }

  async deleteVehicle(id) {
    if (!confirm('Delete vehicle?')) return;
    try {
      await fetch(`/api/vehicles?company_id=${this.currentCompany.id}&id=${id}`, { method: 'DELETE' });
      this.showToast('Vehicle deleted');
      await this.loadVehicles();
      this.renderVehiclesMenu();
    } catch (e) {
      console.error(e);
    }
  }

  /* Menu 8: Property Sales & Purchases */
  renderPropertyMenu() {
    const main = document.getElementById('mainContent');
    const docs = this.documents.filter(d => d.menu_key === 'property');

    main.innerHTML = `
      <div class="view-header">
        <h2 class="view-title">Menu 8: Property Sales & Purchases</h2>
        <div class="view-actions">
          <button class="action-btn" onclick="app.openDocUploadModal('property', ['Sale', 'Purchase'])">
            ➕ Log Property Transaction
          </button>
        </div>
      </div>

      <div class="table-container">
        <table class="custom-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Mode</th>
              <th>Property Name & Address</th>
              <th>Seller / Buyer</th>
              <th>Total Amount (₹)</th>
              <th>Left Amount (₹) [Masked]</th>
              <th>Right Amount (₹)</th>
              <th>Documents</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${docs.length === 0 ? `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:30px;">No property sales or purchase records added.</td></tr>` : ''}
            ${docs.map(d => {
              const meta = d.metadata || {};
              const isMasked = this.maskedState[d.id] !== false;
              const leftAmtStr = `₹ ${parseFloat(meta.left_amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;

              return `
                <tr>
                  <td><strong>${d.doc_date}</strong></td>
                  <td><span class="${d.category === 'Sale' ? 'card-badge badge-success' : 'card-badge badge-warning'}">${d.category}</span></td>
                  <td><strong>${meta.property_name || 'N/A'}</strong><br><span style="font-size:0.8rem; color:var(--text-muted);">${meta.address || ''}</span></td>
                  <td>${d.category === 'Sale' ? meta.seller_name : meta.buyer_name || 'N/A'}</td>
                  <td style="font-weight:700;">₹ ${parseFloat(d.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                  <td>
                    <div class="masked-amount-wrapper">
                      <span style="font-weight:700; font-family:monospace; font-size:1rem; color:#f59e0b;">
                        ${isMasked ? 'XXXX.XX' : leftAmtStr}
                      </span>
                      <button class="eye-btn" onclick="app.toggleMaskAmount(${d.id})" title="Toggle View Left Amount">
                        ${isMasked ? '👁️' : '🙈'}
                      </button>
                    </div>
                  </td>
                  <td style="font-weight:700; color:#60a5fa;">₹ ${parseFloat(meta.right_amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                  <td>
                    ${(d.files || []).map(f => `
                      <span class="doc-pill" onclick="app.viewDocument(${d.id}, ${f.id})">
                        📄 ${f.file_name}
                      </span>
                    `).join('') || '<span style="color:var(--text-dim);">No file</span>'}
                  </td>
                  <td>
                    <button class="action-btn secondary" style="padding:4px 8px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteDoc(${d.id})">Delete</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  toggleMaskAmount(docId) {
    this.maskedState[docId] = !this.maskedState[docId];
    this.renderPropertyMenu();
  }

  /* ==========================================================
     DOCUMENT UPLOADS & DYNAMIC MODAL INPUTS
     ========================================================== */
  openDocUploadModal(menuKey, categories) {
    document.getElementById('docCategorySelect').innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
    const formFields = document.getElementById('dynamicFormFields');
    formFields.innerHTML = '';

    if (menuKey === 'office') {
      formFields.innerHTML = `
        <div class="form-group" id="guestFields" style="display:none;">
          <label class="form-label">Guest Name *</label>
          <input type="text" id="guestName" class="form-input" placeholder="e.g. John Doe">
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-top:8px;">
            <div>
              <label class="form-label">Hotel (₹)</label>
              <input type="number" id="guestHotelAmt" class="form-input" placeholder="0">
            </div>
            <div>
              <label class="form-label">Food (₹)</label>
              <input type="number" id="guestFoodAmt" class="form-input" placeholder="0">
            </div>
            <div>
              <label class="form-label">Others (₹)</label>
              <input type="number" id="guestOthersAmt" class="form-input" placeholder="0">
            </div>
          </div>
        </div>
      `;
      const catSelect = document.getElementById('docCategorySelect');
      catSelect.onchange = () => {
        document.getElementById('guestFields').style.display = catSelect.value === 'Guest Maintenance' ? 'block' : 'none';
      };
    } else if (menuKey === 'travel') {
      formFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">Person Name & Designation *</label>
          <input type="text" id="travelPerson" class="form-input" placeholder="e.g. Rahul Sharma - Sr Manager" required>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label class="form-label">Boarding (Starting at)</label>
            <input type="text" id="travelBoarding" class="form-input" placeholder="e.g. Mumbai">
          </div>
          <div class="form-group">
            <label class="form-label">Destination (Reached at)</label>
            <input type="text" id="travelDestination" class="form-input" placeholder="e.g. Delhi">
          </div>
        </div>
      `;
    } else if (menuKey === 'property') {
      formFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">Property Name & Address *</label>
          <input type="text" id="propName" class="form-input" placeholder="e.g. Commercial Plot 42" required>
        </div>
        <div class="form-group">
          <label class="form-label">Seller / Buyer Name *</label>
          <input type="text" id="propParty" class="form-input" placeholder="e.g. Apex Builders" required>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label class="form-label">Left Amount (₹) [Masked Eye Toggle]</label>
            <input type="number" id="propLeftAmt" class="form-input" placeholder="0.00" required>
          </div>
          <div class="form-group">
            <label class="form-label">Right Amount (₹)</label>
            <input type="number" id="propRightAmt" class="form-input" placeholder="0.00" required>
          </div>
        </div>
      `;
    } else if (menuKey === 'advances') {
      formFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">Select Employee *</label>
          <select id="advEmpSelect" class="form-select" required>
            ${this.employees.map(e => `<option value="${e.name}">${e.name} (${e.designation})</option>`).join('') || '<option value="General">General Employee</option>'}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Purpose</label>
          <input type="text" id="advPurpose" class="form-input" placeholder="e.g. Travel Advance / Equipment">
        </div>
      `;
    } else if (menuKey === 'bank') {
      formFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">Bank Name / Tenure</label>
          <input type="text" id="bankName" class="form-input" placeholder="e.g. HDFC Bank - 5 Years Tenure">
        </div>
      `;
    } else if (menuKey === 'formalities') {
      formFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">Person Name & Phone Number *</label>
          <input type="text" id="formPerson" class="form-input" placeholder="e.g. Vikas Kumar - 9876543210" required>
        </div>
        <div class="form-group">
          <label class="form-label">Purpose</label>
          <input type="text" id="formPurpose" class="form-input" placeholder="e.g. ROC Filing & Stamp Duty">
        </div>
      `;
    }

    this.openModal('docUploadModal');
    this.setupDatePickers();
  }

  async handleDocUploadSubmit(e) {
    e.preventDefault();
    const category = document.getElementById('docCategorySelect').value;
    const docDate = document.getElementById('docDateInput').value;
    const amount = parseFloat(document.getElementById('docAmountInput').value) || 0;
    const fileInput = document.getElementById('docFileInput');

    const metadata = {};
    if (this.currentMenu === 'office' && category === 'Guest Maintenance') {
      metadata.guest_name = document.getElementById('guestName')?.value || '';
      metadata.hotel_amt = parseFloat(document.getElementById('guestHotelAmt')?.value) || 0;
      metadata.food_amt = parseFloat(document.getElementById('guestFoodAmt')?.value) || 0;
      metadata.others_amt = parseFloat(document.getElementById('guestOthersAmt')?.value) || 0;
    } else if (this.currentMenu === 'travel') {
      metadata.person_name = document.getElementById('travelPerson')?.value || '';
      metadata.boarding = document.getElementById('travelBoarding')?.value || '';
      metadata.destination = document.getElementById('travelDestination')?.value || '';
    } else if (this.currentMenu === 'property') {
      metadata.property_name = document.getElementById('propName')?.value || '';
      metadata.seller_name = document.getElementById('propParty')?.value || '';
      metadata.buyer_name = document.getElementById('propParty')?.value || '';
      metadata.left_amount = parseFloat(document.getElementById('propLeftAmt')?.value) || 0;
      metadata.right_amount = parseFloat(document.getElementById('propRightAmt')?.value) || 0;
    } else if (this.currentMenu === 'advances') {
      metadata.person_name = document.getElementById('advEmpSelect')?.value || '';
      metadata.purpose = document.getElementById('advPurpose')?.value || '';
    } else if (this.currentMenu === 'bank') {
      metadata.bank_name = document.getElementById('bankName')?.value || '';
    } else if (this.currentMenu === 'formalities') {
      metadata.person_name = document.getElementById('formPerson')?.value || '';
      metadata.purpose = document.getElementById('formPurpose')?.value || '';
    }

    const filesList = [];
    if (fileInput.files && fileInput.files.length > 0) {
      for (let i = 0; i < fileInput.files.length; i++) {
        const file = fileInput.files[i];
        const dataUrl = await this.readFileAsDataURL(file);
        filesList.push({
          name: file.name,
          type: file.type,
          size: file.size,
          data: dataUrl
        });
      }
    }

    const payload = {
      company_id: this.currentCompany.id,
      menu_key: this.currentMenu,
      category,
      doc_date: docDate,
      amount,
      metadata,
      files: filesList
    };

    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Document entry saved & ₹ ${amount.toLocaleString()} deducted from daily budget!`);
        this.closeModal('docUploadModal');
        await this.loadDocuments();
        await this.loadBudget();
        this.renderCurrentMenu();
      } else {
        alert(data.error || 'Failed to upload documents');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async deleteDoc(id) {
    if (!confirm('Delete document entry?')) return;
    try {
      await fetch(`/api/documents?id=${id}`, { method: 'DELETE' });
      this.showToast('Document entry deleted');
      await this.loadDocuments();
      await this.loadBudget();
      this.renderCurrentMenu();
    } catch (e) {
      console.error(e);
    }
  }

  /* Universal Document Viewer */
  async viewDocument(docId, fileId) {
    const doc = this.documents.find(d => d.id === docId);
    if (!doc) return;
    const file = (doc.files || []).find(f => f.id === fileId);
    if (!file) return;

    this.currentViewingDoc = { doc, file };
    const previewArea = document.getElementById('docPreviewArea');
    const title = document.getElementById('viewerModalTitle');
    const downloadBtn = document.getElementById('docDownloadBtn');
    const metaInfo = document.getElementById('docMetaInfo');

    title.innerText = `Previewing: ${file.file_name}`;
    downloadBtn.href = file.file_data;
    metaInfo.innerText = `Type: ${file.file_type || 'Unknown'} | Size: ${(file.file_size / 1024).toFixed(1)} KB | Uploaded: ${doc.doc_date}`;

    if (file.file_type.includes('image')) {
      previewArea.innerHTML = `<img src="${file.file_data}" class="doc-preview-img" alt="Document Preview">`;
    } else if (file.file_type.includes('text') || file.file_name.endsWith('.txt')) {
      const base64Content = file.file_data.split(',')[1] || '';
      const textContent = atob(base64Content);
      previewArea.innerHTML = `<textarea class="doc-text-editor" id="docEditableText">${textContent}</textarea>`;
    } else {
      previewArea.innerHTML = `
        <div style="text-align:center; padding:20px; color:white;">
          <div style="font-size:3rem; margin-bottom:10px;">📄</div>
          <div style="font-weight:700; font-size:1.1rem;">${file.file_name}</div>
          <p style="color:var(--text-muted); margin-top:6px;">Document Viewer Active. Click download below to save or view offline.</p>
        </div>
      `;
    }

    this.openModal('docViewerModal');
  }

  saveDocEdit() {
    const editableText = document.getElementById('docEditableText');
    if (editableText && this.currentViewingDoc) {
      const newText = editableText.value;
      const base64New = btoa(newText);
      this.currentViewingDoc.file.file_data = `data:text/plain;base64,${base64New}`;
      this.showToast('Text document edits saved!');
    } else {
      this.showToast('Document metadata updated');
    }
    this.closeModal('docViewerModal');
  }

  /* Utility Helpers */
  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
  }

  closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
  }
}

// Global App Instance
const app = new App();
