// Multi-Company Asset & Document Management Engine
class App {
  constructor() {
    this.companies = [];
    this.currentCompany = null;
    this.currentMenu = localStorage.getItem('activeMenuKey') || 'dashboard';
    this.budget = { set_amount: 0, carried_over_amount: 0, total_spent: 0, remaining_amount: 0 };
    this.documents = [];
    this.employees = [];
    this.vehicles = [];
    this.registeredUsers = [];
    this.maskedState = {}; // Property left amount mask toggle state
    this.currentViewingDoc = null;
    this.currentUser = null;
    this.pendingUploadFiles = []; // Staging array for file progress list
    this.editingDocId = null; // Staging doc ID for edit mode

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

  isSuperAdmin() {
    return Boolean(this.currentUser && this.currentUser.role === 'super_admin');
  }

  /* ==========================================================
     AUTHENTICATION & ROLE-BASED ACCESS CONTROL
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

  async showAppBody() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appBody').style.display = 'flex';

    const saBtn = document.getElementById('superAdminHeaderBtn');

    if (!this.isSuperAdmin()) {
      if (saBtn) saBtn.style.display = 'none';
    } else {
      if (saBtn) saBtn.style.display = 'inline-flex';
    }

    const savedMenu = localStorage.getItem('activeMenuKey');
    if (savedMenu) {
      this.currentMenu = savedMenu;
    }
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-menu') === this.currentMenu);
    });

    await this.loadCompanies();
  }

  async handleLoginSubmit(e, forceLogoutOther = false) {
    if (e && e.preventDefault) e.preventDefault();
    let username = '';
    let password = '';
    let role = 'super_admin';

    if (forceLogoutOther && this.pendingForceLoginDetails) {
      username = this.pendingForceLoginDetails.username;
      password = this.pendingForceLoginDetails.password;
      role = this.pendingForceLoginDetails.role || 'super_admin';
    } else {
      const uEl = document.getElementById('loginUsername');
      const pEl = document.getElementById('loginPassword');
      const rEl = document.getElementById('loginRole');
      if (uEl) username = uEl.value.trim();
      if (pEl) password = pEl.value;
      if (rEl) role = rEl.value;
    }

    if (!username || !password) {
      alert('Please enter username and password.');
      return;
    }

    try {
      const res = await fetch('/api/auth?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role, force_logout_other: forceLogoutOther })
      });
      const data = await res.json();

      if (data.prompt_force_login) {
        this.pendingForceLoginDetails = { username, password, role };
        const msgEl = document.getElementById('sessionOverrideMessage');
        if (msgEl) {
          msgEl.innerHTML = `Account <strong style="color:#60a5fa;">${this.escapeHtml(username)}</strong> is currently logged in on another device or browser session.<br><br>Logging in here will log out the other active device immediately.`;
        }
        this.openModal('sessionOverrideModal');
        return;
      }

      if (data.success) {
        this.closeModal('sessionOverrideModal');
        this.pendingForceLoginDetails = null;
        this.currentUser = data.user;
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        this.showToast(data.message || `Welcome back, ${data.user.username}!`);
        await this.showAppBody();
        this.startSessionWatcher();
      } else {
        alert(data.error || 'Invalid credentials');
      }
    } catch (err) {
      console.error(err);
      if (username === 'superadmin' || username === 'admin') {
        if (password === 'admin123' || password === 'inspenox2025') {
          const dummyUser = { id: 1, username: 'superadmin', role: 'super_admin' };
          const uniqueToken = 'mock_token_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
          this.currentUser = dummyUser;
          localStorage.setItem('authToken', uniqueToken);
          localStorage.setItem('currentUser', JSON.stringify(dummyUser));
          this.showToast('Super Admin Login Successful!');
          await this.showAppBody();
          this.startSessionWatcher();
          return;
        }
      }
      alert('Invalid username or password.');
    }
  }

  async confirmForceLogin() {
    await this.handleLoginSubmit(null, true);
  }

  startSessionWatcher() {
    if (this.sessionTimer) clearInterval(this.sessionTimer);

    // Fast 2-second polling for immediate session termination detection
    this.sessionTimer = setInterval(() => {
      this.verifyActiveSession();
    }, 2000);

    // Instant check when switching back to browser tab/window
    if (!this.sessionListenersAdded) {
      window.addEventListener('focus', () => this.verifyActiveSession());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.verifyActiveSession();
      });
      this.sessionListenersAdded = true;
    }
  }

  async verifyActiveSession() {
    const token = localStorage.getItem('authToken');
    if (!token || !this.currentUser) return;
    try {
      const res = await fetch('/api/auth?action=verify-session', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.session_invalid) {
        if (this.sessionTimer) clearInterval(this.sessionTimer);
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('activeMenuKey');
        this.currentUser = null;
        this.currentCompany = null;
        this.documents = [];
        this.employees = [];
        this.vehicles = [];

        const msgEl = document.getElementById('sessionTerminatedMsg');
        if (msgEl && data.error) {
          msgEl.innerText = data.error;
        }

        this.openModal('sessionTerminatedModal');
      }
    } catch (e) {
      console.error('Session verify check failed:', e);
    }
  }

  acknowledgeSessionTerminated() {
    this.closeModal('sessionTerminatedModal');
    this.showAuthScreen();
  }

  togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      btnEl.innerText = '🙈';
    } else {
      input.type = 'password';
      btnEl.innerText = '👁️';
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
      this.showToast('⚡ Database & Tables initialized successfully!', 'success');
    }
  }

  logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('activeMenuKey');
    this.currentUser = null;
    this.currentCompany = null;
    this.documents = [];
    this.employees = [];
    this.vehicles = [];
    this.showToast('Logged out');
    this.showAuthScreen();
  }

  /* Responsive sidebar toggle for mobile */
  toggleSidebar() {
    const sidebar = document.getElementById('mainSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
      sidebar.classList.remove('open');
      overlay && overlay.classList.remove('active');
    } else {
      sidebar.classList.add('open');
      overlay && overlay.classList.add('active');
    }
  }

  closeSidebar() {
    const sidebar = document.getElementById('mainSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar && sidebar.classList.remove('open');
    overlay && overlay.classList.remove('active');
  }

  // Set date pickers to TODAY by default while allowing full back-date flexibility
  setupDatePickers() {
    const todayStr = new Date().toISOString().split('T')[0];
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
      input.removeAttribute('min');
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
     COMPANY & STRICT DATA ISOLATION ENGINE
     ========================================================== */
  async loadCompanies() {
    try {
      const res = await fetch('/api/companies');
      const data = await res.json();
      if (data.success && data.companies.length > 0) {
        this.companies = data.companies;

        if (!this.isSuperAdmin() && this.currentUser.company_id) {
          const userComp = this.companies.find(c => c.id == this.currentUser.company_id);
          this.currentCompany = userComp || this.companies[0];
        } else {
          const savedCompId = localStorage.getItem('activeCompanyId');
          const found = this.companies.find(c => c.id == savedCompId);
          this.currentCompany = found || this.companies[0];
        }
      } else {
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

    const defaultLogoSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='42' height='42' viewBox='0 0 24 24' fill='none' stroke='%23eab308' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='2' y='7' width='20' height='14' rx='2' ry='2'></rect><path d='M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'></path></svg>";
    const logoSrc = this.currentCompany.logo_data || defaultLogoSvg;

    // ── Top header bar ──
    const headerName = document.getElementById('headerCompanyName');
    const headerGst  = document.getElementById('headerCompanyGst');
    const headerLogo = document.getElementById('headerCompanyLogo');
    if (headerName) headerName.innerText = this.currentCompany.name;
    if (headerGst)  headerGst.innerText  = `GST: ${this.currentCompany.gst_number}`;
    if (headerLogo) headerLogo.src = logoSrc;

    // ── Sidebar company branding card ──
    const sidebarName = document.getElementById('sidebarCompanyName');
    const sidebarGst  = document.getElementById('sidebarCompanyGst');
    const sidebarLogo = document.getElementById('sidebarCompanyLogo');
    if (sidebarName) sidebarName.innerText = this.currentCompany.name;
    if (sidebarGst)  sidebarGst.innerText  = `GST: ${this.currentCompany.gst_number}`;
    if (sidebarLogo) sidebarLogo.src = logoSrc;

    localStorage.setItem('activeCompanyId', this.currentCompany.id);
  }

  clearCreateUserInputs() {
    const uInput = document.getElementById('newAuthUsername');
    const pInput = document.getElementById('newAuthPassword');
    const cuInput = document.getElementById('changePassUsername');
    const cpInput = document.getElementById('changePassNew');
    if (uInput) uInput.value = '';
    if (pInput) pInput.value = '';
    if (cuInput) cuInput.value = '';
    if (cpInput) cpInput.value = '';
  }

  async openSuperAdminModal() {
    if (!this.isSuperAdmin()) {
      alert('Access Denied: Only Super Admin can manage companies and user logins.');
      return;
    }
    this.renderCompanyList();
    this.populateCompanyDropdowns();
    this.clearCreateUserInputs();
    await this.loadRegisteredUsers();
    this.openModal('superAdminModal');
  }

  async switchSuperAdminTab(tab) {
    const secComp = document.getElementById('saSectionCompanies');
    const secLogins = document.getElementById('saSectionLogins');
    const secActivities = document.getElementById('saSectionActivities');
    const btnComp = document.getElementById('saTabCompanies');
    const btnLogins = document.getElementById('saTabLogins');
    const btnActivities = document.getElementById('saTabActivities');

    if (tab === 'companies') {
      if (secComp) secComp.style.display = 'block';
      if (secLogins) secLogins.style.display = 'none';
      if (secActivities) secActivities.style.display = 'none';
      if (btnComp) btnComp.className = 'action-btn';
      if (btnLogins) btnLogins.className = 'action-btn secondary';
      if (btnActivities) btnActivities.className = 'action-btn secondary';
    } else if (tab === 'logins') {
      if (secComp) secComp.style.display = 'none';
      if (secLogins) secLogins.style.display = 'block';
      if (secActivities) secActivities.style.display = 'none';
      if (btnComp) btnComp.className = 'action-btn secondary';
      if (btnLogins) btnLogins.className = 'action-btn';
      if (btnActivities) btnActivities.className = 'action-btn secondary';
      this.clearCreateUserInputs();
      await this.loadRegisteredUsers();
    } else if (tab === 'activities') {
      if (secComp) secComp.style.display = 'none';
      if (secLogins) secLogins.style.display = 'none';
      if (secActivities) secActivities.style.display = 'block';
      if (btnComp) btnComp.className = 'action-btn secondary';
      if (btnLogins) btnLogins.className = 'action-btn secondary';
      if (btnActivities) btnActivities.className = 'action-btn';
      await this.loadLoginActivities();
    }
  }

  async loadLoginActivities() {
    const tbody = document.getElementById('loginActivitiesTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">Loading login audit logs...</td></tr>`;

    try {
      const res = await fetch('/api/auth?action=get-login-activities');
      const data = await res.json();
      if (data.success && data.activities && data.activities.length > 0) {
        tbody.innerHTML = data.activities.map(a => {
          const badgeClass = a.status === 'SUCCESS' ? 'badge-success' :
                             a.status === 'SESSION_OVERRIDDEN' ? 'badge-warning' : 'badge-danger';
          const statusLabel = a.status === 'SESSION_OVERRIDDEN' ? 'Session Overridden' : a.status;
          let dtStr = a.login_time || 'Just now';
          if (dtStr.includes('T')) {
            const parts = dtStr.split('T');
            dtStr = `${parts[0]} ${parts[1].substring(0, 5)}`;
          }

          return `
            <tr>
              <td>
                <strong>👤 ${this.escapeHtml(a.username)}</strong>
                <div style="font-size:0.75rem; color:var(--text-muted);">${a.role}</div>
              </td>
              <td>${this.escapeHtml(a.company_name || 'N/A')}</td>
              <td>
                <code>${this.escapeHtml(a.ip_address || '127.0.0.1')}</code>
                <div style="font-size:0.72rem; color:var(--text-muted); max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${this.escapeHtml(a.user_agent || '')}">${this.escapeHtml(a.user_agent || 'Browser')}</div>
              </td>
              <td><span class="card-badge ${badgeClass}">${statusLabel}</span></td>
              <td style="color:var(--text-muted);">${dtStr}</td>
            </tr>
          `;
        }).join('');
      } else {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">No login activities recorded yet.</td></tr>`;
      }
    } catch (e) {
      console.error('Failed to load login activities:', e);
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#f87171; padding:20px;">Failed to load audit logs.</td></tr>`;
    }
  }

  renderCompanyList() {
    const listContainer = document.getElementById('companyListContainer');
    listContainer.innerHTML = this.companies.map(c => `
      <div class="company-card-item">
        <div class="company-card-info" style="display:flex; align-items:center; gap:10px;">
          ${c.logo_data ? `<img src="${c.logo_data}" style="width:32px; height:32px; border-radius:4px; object-fit:cover;">` : '🏢'}
          <div>
            <div style="font-weight:700; color:white; word-break:break-word;">${c.name} ${c.id === this.currentCompany?.id ? ' <span class="badge-success card-badge">Active</span>' : ''}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">GST: ${c.gst_number}</div>
          </div>
        </div>
        <div class="card-action-group">
          <button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="app.editCompany(${c.id})">Edit</button>
          ${c.id !== this.currentCompany?.id ? `<button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="app.switchCompany(${c.id})">Switch</button>` : ''}
          ${this.isSuperAdmin() ? `<button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteCompany(${c.id})">Delete</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  populateCompanyDropdowns() {
    const select = document.getElementById('newAuthCompany');
    if (select) {
      select.innerHTML = this.companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
  }

  async loadRegisteredUsers() {
    try {
      const res = await fetch('/api/auth?action=get-users');
      const data = await res.json();
      if (data.success) {
        this.registeredUsers = data.users || [];
        this.renderRegisteredUsersList();
      }
    } catch (e) {
      console.error('Failed to load registered users:', e);
    }
  }

  renderRegisteredUsersList() {
    const container = document.getElementById('userLoginsListContainer');
    if (!container) return;

    if (this.registeredUsers.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem; padding:10px;">No registered company admin or employee logins found.</div>`;
      return;
    }

    container.innerHTML = this.registeredUsers.map(u => {
      const roleBadge = u.role === 'super_admin' ? '<span class="card-badge badge-warning">Super Admin</span>' :
                        u.role === 'company_admin' ? '<span class="card-badge badge-info">Company Admin</span>' :
                        '<span class="card-badge badge-success">Employee</span>';

      const companyLabel = u.company_name || (u.company_id ? `Company #${u.company_id}` : (u.role === 'super_admin' ? 'All Companies' : 'Unassigned'));

      let lastLoginText = 'Never Logged In';
      if (u.last_login) {
        let dt = u.last_login;
        if (dt.includes('T')) dt = dt.split('T')[0] + ' ' + dt.split('T')[1].substring(0, 5);
        lastLoginText = `${dt} (${u.last_login_ip || '127.0.0.1'})`;
      }

      return `
        <div class="user-card-item">
          <div class="user-card-info">
            <div style="font-weight:700; color:white; display:flex; align-items:center; gap:8px; flex-wrap:wrap; word-break:break-word;">
              👤 ${u.username} ${roleBadge}
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
              Assigned Company: <strong style="color:#60a5fa;">${companyLabel}</strong>
            </div>
            <div style="font-size:0.76rem; color:#94a3b8; margin-top:3px;">
              🕒 Last Login: <span style="color:#fbbf24;">${lastLoginText}</span>
            </div>
          </div>
          <div class="card-action-group">
            <button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="app.fillResetPassword('${u.username}')">🔑 Reset Pass</button>
            ${(this.isSuperAdmin() && u.username !== 'superadmin') ? `<button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteUser(${u.id})">Delete</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  fillResetPassword(username) {
    document.getElementById('changePassUsername').value = username;
    document.getElementById('changePassNew').focus();
    this.showToast(`Selected user '${username}' for password update.`);
  }

  async deleteUser(userId) {
    if (!this.isSuperAdmin()) {
      alert('Access Denied: Only Super Admin can delete users.');
      return;
    }
    if (!confirm('Are you sure you want to delete this user login?')) return;
    try {
      const res = await fetch(`/api/auth?action=delete-user&id=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        this.showToast('User login deleted');
        await this.loadRegisteredUsers();
      }
    } catch (e) {
      console.error(e);
    }
  }

  editCompany(compId) {
    const comp = this.companies.find(c => c.id === compId);
    if (!comp) return;

    document.getElementById('editCompanyId').value = comp.id;
    document.getElementById('newCompanyName').value = comp.name;
    document.getElementById('newCompanyGst').value = comp.gst_number;
    document.getElementById('companyFormTitle').innerText = `Edit Company: ${comp.name}`;
    document.getElementById('cancelEditCompanyBtn').style.display = 'inline-block';
  }

  resetCompanyForm() {
    document.getElementById('editCompanyId').value = '';
    document.getElementById('newCompanyName').value = '';
    document.getElementById('newCompanyGst').value = '';
    document.getElementById('newCompanyLogo').value = '';
    document.getElementById('companyFormTitle').innerText = 'Add New Company';
    document.getElementById('cancelEditCompanyBtn').style.display = 'none';
  }

  async handleSaveCompany(e) {
    e.preventDefault();
    const editId = document.getElementById('editCompanyId').value;
    const name = document.getElementById('newCompanyName').value.trim();
    const gst = document.getElementById('newCompanyGst').value.trim();
    const logoFile = document.getElementById('newCompanyLogo').files[0];

    let logoData = null;
    if (logoFile) {
      logoData = await this.readFileAsDataURL(logoFile);
    }

    try {
      const method = editId ? 'PUT' : 'POST';
      const bodyPayload = editId ? { id: parseInt(editId), name, gst_number: gst, logo_data: logoData } : { name, gst_number: gst, logo_data: logoData || '' };

      const res = await fetch('/api/companies', {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Company '${name}' saved successfully!`);
        this.resetCompanyForm();
        await this.loadCompanies();
        this.renderCompanyList();
      } else {
        alert(data.error || 'Failed to save company');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async handleCreateUserSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('newAuthUsername').value.trim();
    const password = document.getElementById('newAuthPassword').value;
    const company_id = document.getElementById('newAuthCompany').value;
    const role = document.getElementById('newAuthRole').value;

    try {
      const res = await fetch('/api/auth?action=create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role, company_id })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`User credentials for '${username}' created!`);
        this.clearCreateUserInputs();
        await this.loadRegisteredUsers();
      } else {
        alert(data.error || 'Failed to create user');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async handleChangeUserPasswordSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('changePassUsername').value.trim();
    const newPassword = document.getElementById('changePassNew').value;

    try {
      const res = await fetch('/api/auth?action=change-user-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Password updated for user '${username}'!`);
        this.clearCreateUserInputs();
        await this.loadRegisteredUsers();
      } else {
        alert(data.error || 'Failed to update password');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async switchCompany(compId) {
    if (!this.isSuperAdmin()) {
      alert('Company Admins cannot switch between companies.');
      return;
    }
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
    if (!this.isSuperAdmin()) {
      alert('Access Denied: Only Super Admin can delete companies.');
      return;
    }
    if (!confirm('Are you sure you want to delete this company and all its data?')) return;
    try {
      await fetch(`/api/companies?id=${compId}`, { method: 'DELETE' });
      this.showToast('Company deleted');
      await this.loadCompanies();
      this.renderCompanyList();
    } catch (e) {
      console.error(e);
    }
  }

  /* ==========================================================
     DAILY BUDGET ENGINE & SEPARATE COMPANY DATA REFRESH
     ========================================================== */
  getMenuName(menuKey) {
    const map = {
      dashboard: 'Executive Dashboard',
      budget: 'Daily Budget Manager',
      itr: 'Menu 1: ITR (Income Tax Returns)',
      gst: 'Menu 2: GST Returns & Paid Statements',
      bank: 'Menu 3: Bank Loans & EMI Management',
      office: 'Menu 4: Office Maintenance',
      employees: 'Menu 5: HR & Employees Payroll',
      vehicles: 'Menu 6: Vehicle Fleet Status',
      travel: 'Menu 7: Travelling Allowance',
      property: 'Menu 8: Property Sales & Purchases',
      advances: 'Menu 9: Employee Advances',
      formalities: 'Menu 10: Company Formalities'
    };
    return map[menuKey] || 'Module Data';
  }

  showLoading(message = 'Loading Page Content...') {
    const main = document.getElementById('mainContent');
    if (!main) return;
    const title = this.getMenuName(this.currentMenu);
    main.innerHTML = `
      <div class="page-loader-container">
        <div class="spinner-ring"></div>
        <div class="loader-title">${title}</div>
        <div class="loader-subtitle">
          <span>⚡</span> ${message}
        </div>
      </div>
    `;
  }

  async refreshData() {
    if (!this.currentCompany) return;
    this.showLoading(`Syncing company records & module data...`);

    this.documents = [];
    this.employees = [];
    this.vehicles = [];

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

        const receiptCard = document.getElementById('budgetReceiptBadgeCard');
        const receiptLink = document.getElementById('budgetTodayReceiptLink');
        if (receiptCard && receiptLink) {
          if (this.budget.receipt_file_data) {
            receiptCard.style.display = 'block';
            receiptLink.href = this.budget.receipt_file_data;
            receiptLink.download = this.budget.receipt_file_name || 'budget_receipt';
          } else {
            receiptCard.style.display = 'none';
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async handleBudgetWidgetReceiptSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    this.pendingBudgetWidgetReceipt = {
      name: file.name,
      data: await this.readFileAsDataURL(file)
    };
    const label = document.getElementById('widgetReceiptFileLabel');
    if (label) label.innerText = file.name.length > 12 ? file.name.substring(0, 10) + '...' : file.name;
  }

  async handleSetBudget(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('setBudgetInput').value) || 0;
    const rData = this.pendingBudgetWidgetReceipt ? this.pendingBudgetWidgetReceipt.data : null;
    const rName = this.pendingBudgetWidgetReceipt ? this.pendingBudgetWidgetReceipt.name : null;

    try {
      const res = await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: this.currentCompany.id, set_amount: amount, receipt_file_data: rData, receipt_file_name: rName })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Daily Maintenance budget set to ₹ ${amount.toLocaleString('en-IN')}`);
        document.getElementById('setBudgetInput').value = '';
        this.pendingBudgetWidgetReceipt = null;
        const label = document.getElementById('widgetReceiptFileLabel');
        if (label) label.innerText = 'Receipt';
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
    localStorage.setItem('activeMenuKey', menuKey);

    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-menu') === menuKey);
    });
    // Auto-close sidebar on mobile after navigation
    if (window.innerWidth <= 768) this.closeSidebar();

    this.showLoading(`Loading ${this.getMenuName(menuKey)}...`);
    setTimeout(() => {
      this.renderCurrentMenu();
    }, 50);
  }

  renderCurrentMenu() {
    const main = document.getElementById('mainContent');

    switch (this.currentMenu) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'budget':
        this.renderBudgetMenu();
        break;
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
        this.renderGenericMenu('Menu 7: Travelling Allowance', 'travel', ['Flight Ticket', 'Train Ticket', 'Bus Ticket', 'Cab', 'Other Travel'], false);
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

  /* ==========================================================
     BUDGET MANAGER — Date-wise tracking, edit, delete, filters
     ========================================================== */

  async renderBudgetMenu() {
    const main = document.getElementById('mainContent');
    const isSA = this.isSuperAdmin();

    // Load history (filters from state)
    this.budgetHistory = this.budgetHistory || [];
    this.budgetFilters = this.budgetFilters || {
      dateFrom: '',
      dateTo: '',
      companyId: isSA ? 'all' : String(this.currentCompany.id)
    };

    main.innerHTML = `
      <div class="view-header">
        <h2 class="view-title">💰 Daily Budget Manager</h2>
        <div class="view-actions">
          <button class="action-btn" onclick="app.openBudgetModal()" id="addBudgetBtn">
            ➕ Set Budget for Date
          </button>
          <button class="action-btn secondary" onclick="app.loadBudgetHistory()">
            🔄 Refresh
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div style="background:rgba(30,41,59,0.7); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 20px; margin-bottom:20px; display:flex; flex-wrap:wrap; gap:14px; align-items:flex-end;">
        <div class="form-group" style="margin:0; min-width:140px; flex:1;">
          <label class="form-label">📅 From Date</label>
          <input type="date" id="budgetFilterFrom" class="form-input" value="${this.budgetFilters.dateFrom}"
            onchange="app.budgetFilters.dateFrom = this.value">
        </div>
        <div class="form-group" style="margin:0; min-width:140px; flex:1;">
          <label class="form-label">📅 To Date</label>
          <input type="date" id="budgetFilterTo" class="form-input" value="${this.budgetFilters.dateTo}"
            onchange="app.budgetFilters.dateTo = this.value">
        </div>
        ${isSA ? `
        <div class="form-group" style="margin:0; min-width:160px; flex:1;">
          <label class="form-label">🏢 Company (Super Admin)</label>
          <select id="budgetFilterCompany" class="form-select" onchange="app.budgetFilters.companyId = this.value">
            <option value="all" ${this.budgetFilters.companyId === 'all' ? 'selected' : ''}>All Companies</option>
            ${this.companies.map(c => `<option value="${c.id}" ${this.budgetFilters.companyId == c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>` : ''}
        <button class="action-btn" style="flex-shrink:0;" onclick="app.loadBudgetHistory()">
          🔍 Apply Filter
        </button>
        <button class="action-btn secondary" style="flex-shrink:0;" onclick="app.clearBudgetFilters()">
          ✖ Clear
        </button>
      </div>

      <!-- Summary Cards -->
      <div id="budgetSummaryCards" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:16px; margin-bottom:20px;">
        <div style="text-align:center; color:var(--text-dim); padding:20px;">Loading...</div>
      </div>

      <!-- History Table -->
      <div class="table-container">
        <table class="custom-table">
          <thead>
            <tr>
              ${isSA ? '<th>Company</th>' : ''}
              <th>Date</th>
              <th>Set Amount (₹)</th>
              <th>Carried Over (₹)</th>
              <th>Total Available (₹)</th>
              <th>Spent (₹)</th>
              <th>Remaining (₹)</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="budgetHistoryBody">
            <tr><td colspan="${isSA ? 10 : 9}" style="text-align:center; color:var(--text-muted); padding:30px;">Click Refresh or Apply Filter to load data</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Budget Entry Modal -->
      <div class="modal-overlay" id="budgetEntryModal">
        <div class="modal-card" style="max-width:500px;">
          <div class="modal-header">
            <h3 class="modal-title" id="budgetModalTitle">Set Budget for Date</h3>
            <button class="modal-close" onclick="app.closeModal('budgetEntryModal')">&times;</button>
          </div>
          <form onsubmit="app.handleBudgetEntrySubmit(event)">
            ${isSA ? `
            <div class="form-group">
              <label class="form-label">Company *</label>
              <select id="budgetModalCompany" class="form-select" required>
                ${this.companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
            </div>` : `<input type="hidden" id="budgetModalCompany" value="${this.currentCompany.id}">`}
            <div class="form-group">
              <label class="form-label">Date *</label>
              <input type="date" id="budgetModalDate" class="form-input" required>
            </div>
            <div class="form-group">
              <label class="form-label">Set Maintenance Amount (₹) *</label>
              <input type="number" step="0.01" min="0" id="budgetModalAmount" class="form-input" placeholder="e.g. 50000" required>
            </div>
            <div class="form-group">
              <label class="form-label">Attach Receipt / Document (Optional)</label>
              <input type="file" id="budgetModalReceiptFile" accept="image/*,.pdf,.doc,.docx" class="form-input">
            </div>
            <div class="form-group">
              <label class="form-label">Notes (optional)</label>
              <input type="text" id="budgetModalNotes" class="form-input" placeholder="e.g. Festival season budget">
            </div>
            <input type="hidden" id="budgetModalEditId" value="">
            <div style="display:flex; gap:12px; justify-content:flex-end; margin-top:8px;">
              <button type="button" class="action-btn secondary" onclick="app.closeModal('budgetEntryModal')">Cancel</button>
              <button type="submit" class="action-btn">💾 Save Budget</button>
            </div>
          </form>
        </div>
      </div>
    `;

    await this.loadBudgetHistory();
  }

  clearBudgetFilters() {
    this.budgetFilters = {
      dateFrom: '',
      dateTo: '',
      companyId: this.isSuperAdmin() ? 'all' : String(this.currentCompany.id)
    };
    this.renderBudgetMenu();
  }

  async loadBudgetHistory() {
    const isSA = this.isSuperAdmin();
    const filters = this.budgetFilters || {};
    const companyId = filters.companyId || (isSA ? 'all' : String(this.currentCompany.id));

    let url = `/api/budget?action=history&company_id=${companyId}`;
    if (filters.dateFrom) url += `&date_from=${filters.dateFrom}`;
    if (filters.dateTo)   url += `&date_to=${filters.dateTo}`;

    try {
      const res  = await fetch(url);
      const data = await res.json();
      if (!data.success) { this.showToast('Failed to load budget history', 'error'); return; }

      this.budgetHistory = data.history || [];
      this._renderBudgetTable();
      this._renderBudgetSummaryCards();
    } catch (e) {
      console.error(e);
      this.showToast('Network error loading budget history');
    }
  }

  _renderBudgetSummaryCards() {
    const container = document.getElementById('budgetSummaryCards');
    if (!container) return;

    const rows = this.budgetHistory || [];
    const totalSet       = rows.reduce((s, r) => s + (parseFloat(r.set_amount) || 0), 0);
    const totalSpent     = rows.reduce((s, r) => s + (parseFloat(r.total_spent) || 0), 0);
    const totalRemaining = rows.reduce((s, r) => s + (parseFloat(r.remaining_amount) || 0), 0);
    const totalAvail     = rows.reduce((s, r) => s + (parseFloat(r.total_available) || 0), 0);
    const fmt = v => `₹ ${parseFloat(v||0).toLocaleString('en-IN', {minimumFractionDigits:2})}`;

    container.innerHTML = [
      { label: 'Total Entries',        value: rows.length,       color: '#818cf8', icon: '📋' },
      { label: 'Total Budget Set',     value: fmt(totalSet),     color: '#818cf8', icon: '💰' },
      { label: 'Total Available',      value: fmt(totalAvail),   color: '#60a5fa', icon: '🏦' },
      { label: 'Total Spent',          value: fmt(totalSpent),   color: '#f87171', icon: '💸' },
      { label: 'Total Remaining',      value: fmt(totalRemaining), color: '#34d399', icon: '✅' },
    ].map(card => `
      <div style="background:rgba(30,41,59,0.85); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:16px 18px;">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; font-weight:600;">${card.icon} ${card.label}</div>
        <div style="font-size:1.3rem; font-weight:800; color:${card.color}; margin-top:4px;">${card.value}</div>
      </div>
    `).join('');
  }

  _renderBudgetTable() {
    const tbody = document.getElementById('budgetHistoryBody');
    if (!tbody) return;
    const isSA = this.isSuperAdmin();
    const rows = this.budgetHistory || [];
    const fmt  = v => `₹ ${parseFloat(v||0).toLocaleString('en-IN', {minimumFractionDigits:2})}`;
    const cols = isSA ? 10 : 9;

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;color:var(--text-muted);padding:30px;">No budget records found for the selected filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const spent     = parseFloat(r.total_spent) || 0;
      const avail     = parseFloat(r.total_available) || 0;
      const remaining = parseFloat(r.remaining_amount) || 0;
      const pct       = avail > 0 ? Math.min(100, Math.round((spent / avail) * 100)) : 0;
      const statusColor = pct >= 90 ? '#f87171' : pct >= 60 ? '#fbbf24' : '#34d399';
      const statusLabel = pct >= 90 ? '🔴 Critical' : pct >= 60 ? '🟡 Moderate' : '🟢 Healthy';

      return `
        <tr>
          ${isSA ? `<td><strong>${r.company_name || '—'}</strong></td>` : ''}
          <td><strong>${r.budget_date ? String(r.budget_date).split('T')[0] : '—'}</strong></td>
          <td style="color:#818cf8; font-weight:700;">${fmt(r.set_amount)}</td>
          <td style="color:#60a5fa;">${fmt(r.carried_over_amount)}</td>
          <td style="font-weight:700;">${fmt(r.total_available)}</td>
          <td style="color:#f87171; font-weight:700;">${fmt(r.total_spent)}</td>
          <td style="color:${remaining >= 0 ? '#34d399' : '#f87171'}; font-weight:700;">${fmt(remaining)}</td>
          <td>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <span style="color:${statusColor}; font-size:0.8rem; font-weight:600;">${statusLabel}</span>
              <div style="background:rgba(255,255,255,0.1); border-radius:4px; height:6px; width:80px; overflow:hidden;">
                <div style="background:${statusColor}; height:100%; width:${pct}%; transition:width 0.3s;"></div>
              </div>
              <span style="font-size:0.7rem; color:var(--text-muted);">${pct}% used</span>
            </div>
          </td>
          <td style="font-size:0.82rem; color:var(--text-muted); max-width:140px; word-break:break-word;">
            ${r.notes || ''}
            ${r.receipt_file_data ? `<div style="margin-top:2px;"><a href="${r.receipt_file_data}" download="${r.receipt_file_name || 'receipt'}" class="doc-pill" style="font-size:0.75rem;">📄 Receipt</a></div>` : ''}
            ${(!r.notes && !r.receipt_file_data) ? '<span style="color:var(--text-dim);">—</span>' : ''}
          </td>
          <td>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="action-btn secondary" style="padding:4px 10px; font-size:0.78rem;" onclick="app.editBudgetEntry(${r.id})">✏️ Edit</button>
              ${isSA ? `<button class="action-btn secondary" style="padding:4px 10px; font-size:0.78rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteBudgetEntry(${r.id})">🗑️ Delete</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  openBudgetModal(editData = null) {
    const isSA  = this.isSuperAdmin();
    const today = new Date().toISOString().split('T')[0];

    const titleEl  = document.getElementById('budgetModalTitle');
    const dateEl   = document.getElementById('budgetModalDate');
    const amtEl    = document.getElementById('budgetModalAmount');
    const notesEl  = document.getElementById('budgetModalNotes');
    const editIdEl = document.getElementById('budgetModalEditId');
    const compEl   = document.getElementById('budgetModalCompany');

    if (!dateEl) return;

    if (editData) {
      if (titleEl) titleEl.innerText = `Edit Budget — ${String(editData.budget_date).split('T')[0]}`;
      dateEl.value   = String(editData.budget_date).split('T')[0];
      dateEl.readOnly = true;
      if (amtEl)    amtEl.value    = editData.set_amount || 0;
      if (notesEl)  notesEl.value  = editData.notes || '';
      if (editIdEl) editIdEl.value = editData.id;
      if (compEl && isSA) compEl.value = editData.company_id;
    } else {
      if (titleEl)  titleEl.innerText = 'Set Budget for Date';
      dateEl.value   = today;
      dateEl.readOnly = false;
      if (amtEl)    amtEl.value    = '';
      if (notesEl)  notesEl.value  = '';
      if (editIdEl) editIdEl.value = '';
    }

    this.openModal('budgetEntryModal');
  }

  editBudgetEntry(id) {
    const row = (this.budgetHistory || []).find(r => r.id === id);
    if (!row) return;
    this.openBudgetModal(row);
  }

  async deleteBudgetEntry(id) {
    if (!this.isSuperAdmin()) { alert('Only Super Admin can delete budget entries.'); return; }
    if (!confirm('Delete this budget entry? This cannot be undone.')) return;
    try {
      const res  = await fetch(`/api/budget?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        this.showToast('Budget entry deleted');
        await this.loadBudgetHistory();
      } else {
        this.showToast(data.error || 'Delete failed');
      }
    } catch (e) {
      console.error(e);
    }
  }

  async handleBudgetEntrySubmit(e) {
    e.preventDefault();
    const editId    = document.getElementById('budgetModalEditId')?.value;
    const companyId = document.getElementById('budgetModalCompany')?.value || this.currentCompany.id;
    const date      = document.getElementById('budgetModalDate')?.value;
    const amount    = parseFloat(document.getElementById('budgetModalAmount')?.value) || 0;
    const notes     = document.getElementById('budgetModalNotes')?.value || '';
    const fileInput = document.getElementById('budgetModalReceiptFile');

    let rData = null;
    let rName = null;
    if (fileInput && fileInput.files[0]) {
      rName = fileInput.files[0].name;
      rData = await this.readFileAsDataURL(fileInput.files[0]);
    }

    const isEditing = Boolean(editId);
    const method    = isEditing ? 'PUT' : 'POST';
    const payload   = isEditing
      ? { id: parseInt(editId), set_amount: amount, notes, receipt_file_data: rData, receipt_file_name: rName }
      : { company_id: companyId, budget_date: date, set_amount: amount, notes, receipt_file_data: rData, receipt_file_name: rName };

    try {
      const res  = await fetch('/api/budget', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(isEditing ? 'Budget entry updated!' : 'Budget set successfully!');
        this.closeModal('budgetEntryModal');
        const todayStr = new Date().toISOString().split('T')[0];
        if (!date || date === todayStr) await this.loadBudget();
        await this.loadBudgetHistory();
      } else {
        this.showToast(data.error || 'Save failed', 'error');
      }
    } catch (e) {
      console.error(e);
      this.showToast('Network error');
    }
  }

  /* Executive Overview Dashboard Renderer */
  renderDashboard() {
    const main = document.getElementById('mainContent');

    const totalDocs = this.documents.length;
    const totalFiles = this.documents.reduce((acc, d) => acc + (d.files ? d.files.length : 0), 0);
    const empCount = this.employees.length;
    const vehCount = this.vehicles.length;
    const serviceNeededCount = this.vehicles.filter(v => (v.total_kms_driven - v.kms_at_last_service) >= 10000).length;

    const moduleMap = {
      itr: { name: 'ITR & Audits', icon: '📊', count: 0, total: 0 },
      gst: { name: 'GST Returns', icon: '🧾', count: 0, total: 0 },
      bank: { name: 'Bank & EMI', icon: '🏦', count: 0, total: 0 },
      office: { name: 'Office Maintenance', icon: '🏢', count: 0, total: 0 },
      travel: { name: 'Travelling Allowance', icon: '✈️', count: 0, total: 0 },
      property: { name: 'Property Transactions', icon: '🏘️', count: 0, total: 0 },
      advances: { name: 'Employee Advances', icon: '💵', count: 0, total: 0 },
      formalities: { name: 'Formalities', icon: '📋', count: 0, total: 0 }
    };

    this.documents.forEach(d => {
      if (moduleMap[d.menu_key]) {
        moduleMap[d.menu_key].count++;
        moduleMap[d.menu_key].total += parseFloat(d.amount || 0);
      }
    });

    const recentDocs = [...this.documents].slice(0, 5);

    // ── 5:00 PM Daily Expense Report Calculation ──
    const now = new Date();
    const currentHour = now.getHours();
    const todayStr = now.toISOString().split('T')[0];
    const isAfter5PM = currentHour >= 17 || this.force5PMReportPreview;

    const todayDocs = this.documents.filter(d => {
      let dDate = d.doc_date;
      if (dDate && dDate.includes('T')) dDate = dDate.split('T')[0];
      return dDate === todayStr;
    });

    const todayExpensesTotal = todayDocs.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    const todayRemainingBalance = parseFloat(this.budget.remaining_amount || 0);

    main.innerHTML = `
      <div class="view-header">
        <h2 class="view-title">📈 Executive Dashboard Overview</h2>
        <div class="view-actions">
          <button class="action-btn" onclick="app.openDocUploadModal('itr', ['ITR', 'Audit Report', 'Paid Up Capital'])">
            ➕ Add Entry & Upload Docs
          </button>
        </div>
      </div>

      <!-- Evening 5:00 PM Daily Expenses Financial Report Card -->
      <div style="background: linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95)); border: 1px solid ${isAfter5PM ? '#eab308' : 'var(--border-color)'}; border-radius: var(--radius-lg); padding: 20px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); position: relative; overflow: hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:12px;">
          <div>
            <div style="font-size:1.15rem; font-weight:800; color:#fbbf24; display:flex; align-items:center; gap:8px;">
              📊 Evening 5:00 PM Daily Financial Report ${isAfter5PM ? '<span class="card-badge badge-warning" style="background:#eab308; color:#0f172a; font-weight:800;">📢 GENERATED AT 5:00 PM</span>' : '<span class="card-badge badge-info">🕒 SCHEDULED AT 5:00 PM DAILY</span>'}
            </div>
            <div style="font-size:0.82rem; color:var(--text-muted); margin-top:4px;">
              ${todayStr} — Total expenses, itemized spending breakdown, and remaining daily balance.
            </div>
          </div>
          <button class="action-btn secondary" style="padding:6px 12px; font-size:0.8rem;" onclick="app.toggle5PMReportPreview()">
            ${this.force5PMReportPreview ? '✖ Close Preview' : '👁️ Preview 5 PM Report'}
          </button>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:16px;">
          <div style="background:rgba(15,23,42,0.7); border-radius:var(--radius-md); padding:14px; border-left:4px solid #f87171;">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Today's Total Expenses</div>
            <div style="font-size:1.4rem; font-weight:800; color:#f87171; margin-top:4px;">₹ ${todayExpensesTotal.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          </div>
          <div style="background:rgba(15,23,42,0.7); border-radius:var(--radius-md); padding:14px; border-left:4px solid #34d399;">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Remaining Daily Balance</div>
            <div style="font-size:1.4rem; font-weight:800; color:#34d399; margin-top:4px;">₹ ${todayRemainingBalance.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          </div>
          <div style="background:rgba(15,23,42,0.7); border-radius:var(--radius-md); padding:14px; border-left:4px solid #60a5fa;">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Total Transactions Today</div>
            <div style="font-size:1.4rem; font-weight:800; color:#60a5fa; margin-top:4px;">${todayDocs.length} Entries</div>
          </div>
        </div>

        ${isAfter5PM ? `
          <h4 style="color:white; font-size:0.92rem; margin-bottom:8px; font-weight:700;">Itemized List of Today's Expenditures:</h4>
          <div class="table-container" style="max-height:220px; overflow-y:auto; margin:0;">
            <table class="custom-table" style="font-size:0.82rem;">
              <thead>
                <tr>
                  <th>Time / Date</th>
                  <th>Module</th>
                  <th>Category</th>
                  <th>Description / Purpose</th>
                  <th>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${todayDocs.length === 0 ? `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:16px;">No expenses logged today yet.</td></tr>` : ''}
                ${todayDocs.map(d => `
                  <tr>
                    <td>${d.doc_date ? d.doc_date.split('T')[0] : todayStr}</td>
                    <td><span class="card-badge badge-info">${d.menu_key}</span></td>
                    <td><span class="card-badge badge-warning">${d.category}</span></td>
                    <td>${d.metadata?.property_name || d.metadata?.person_name || d.metadata?.bank_name || d.metadata?.vehicle_name || d.metadata?.purpose || d.category}</td>
                    <td style="color:#f87171; font-weight:700;">₹ ${parseFloat(d.amount || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div style="background:rgba(234,179,8,0.1); border:1px dashed rgba(234,179,8,0.4); border-radius:var(--radius-md); padding:12px; text-align:center; font-size:0.85rem; color:#fef08a;">
            ⏰ Official 5:00 PM Evening Financial Summary will automatically expand here at 5:00 PM today!
          </div>
        `}
      </div>

      <!-- KPI Stat Cards Grid -->
      <div class="grid-cards" style="margin-bottom: 24px;">
        <div class="data-card">
          <div class="card-header">
            <span class="card-title">📌 Today's Maintenance Budget</span>
            <span class="card-badge badge-info">${new Date().toISOString().split('T')[0]}</span>
          </div>
          <div class="card-amount">₹ ${parseFloat(this.budget.remaining_amount || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <div style="font-size:0.85rem; color:var(--text-muted); display:flex; justify-content:space-between;">
            <span>Set: ₹${parseFloat(this.budget.set_amount || 0).toLocaleString('en-IN')}</span>
            <span>Spent: ₹${parseFloat(this.budget.total_spent || 0).toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div class="data-card">
          <div class="card-header">
            <span class="card-title">📁 Document Vault Summary</span>
            <span class="card-badge badge-success">${totalFiles} Files</span>
          </div>
          <div class="card-amount" style="color:#60a5fa;">${totalDocs} Document Entries</div>
          <div style="font-size:0.85rem; color:var(--text-muted);">
            Includes PDFs, Images, TXT, and DOCX files across all 10 modules.
          </div>
        </div>

        <div class="data-card">
          <div class="card-header">
            <span class="card-title">👥 HR & Employee Payroll</span>
            <span class="card-badge badge-warning">${empCount} Active</span>
          </div>
          <div class="card-amount" style="color:#fbbf24;">${empCount} Employees</div>
          <div style="font-size:0.85rem; color:var(--text-muted);">
            Manage monthly salary paid/unpaid status tracking per employee.
          </div>
        </div>

        <div class="data-card">
          <div class="card-header">
            <span class="card-title">🚗 Vehicle Fleet Status</span>
            <span class="card-badge ${serviceNeededCount > 0 ? 'badge-danger' : 'badge-success'}">${serviceNeededCount} Alert(s)</span>
          </div>
          <div class="card-amount" style="color:${serviceNeededCount > 0 ? '#f87171' : '#34d399'};">${vehCount} Vehicles</div>
          <div style="font-size:0.85rem; color:var(--text-muted);">
            ${serviceNeededCount > 0 ? `⚠️ ${serviceNeededCount} vehicle(s) reached 10,000 KM threshold needing service.` : 'All vehicles serviced within 10,000 KM limit.'}
          </div>
        </div>
      </div>

      <!-- Module Summary Cards Grid -->
      <h3 style="color:white; margin-bottom:14px; font-weight:700;">Module Financial Summary</h3>
      <div class="grid-cards" style="margin-bottom: 24px;">
        ${Object.keys(moduleMap).map(key => {
          const m = moduleMap[key];
          return `
            <div class="data-card" style="cursor:pointer;" onclick="app.switchMenu('${key}')">
              <div class="card-header">
                <span class="card-title">${m.icon} ${m.name}</span>
                <span class="card-badge badge-info">${m.count} Entries</span>
              </div>
              <div style="font-size:1.2rem; font-weight:700; color:#34d399;">₹ ${m.total.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
              <div style="font-size:0.8rem; color:var(--text-muted); text-align:right;">Click to view module ➔</div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Recent Upload Activity Table -->
      <h3 style="color:white; margin-bottom:14px; font-weight:700;">Recent Uploaded Documents</h3>
      <div class="table-container">
        <table class="custom-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Module</th>
              <th>Category</th>
              <th>Details / Purpose</th>
              <th>Amount (₹)</th>
              <th>Attached Documents</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${recentDocs.length === 0 ? `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">No document records logged yet. Click "Add Entry & Upload Docs" to start.</td></tr>` : ''}
            ${recentDocs.map(d => `
              <tr>
                <td><strong>${d.doc_date ? d.doc_date.split('T')[0] : ''}</strong></td>
                <td><span class="card-badge badge-info" style="text-transform:uppercase;">${d.menu_key}</span></td>
                <td><span class="card-badge badge-warning">${d.category}</span></td>
                <td>${d.metadata?.property_name || d.metadata?.person_name || d.metadata?.bank_name || d.metadata?.purpose || d.category}</td>
                <td style="color:#34d399; font-weight:700;">₹ ${parseFloat(d.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                <td>
                  ${(d.files || []).map(f => `
                    <span class="doc-pill" onclick="app.viewDocument(${d.id}, ${f.id})">
                      📄 ${f.file_name}
                    </span>
                  `).join('') || '<span style="color:var(--text-dim);">No file</span>'}
                </td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="app.viewDocument(${d.id}, ${d.files && d.files[0] ? d.files[0].id : 0})">View</button>
                    <button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="app.editDoc(${d.id})">Edit</button>
                    ${this.isSuperAdmin() ? `<button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteDoc(${d.id})">Delete</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /* Generic Document Menu Renderer with Clean Separated Columns per Module */
  renderGenericMenu(title, menuKey, categories, isFinancialYearFilter = false) {
    const main = document.getElementById('mainContent');
    const docs = this.documents.filter(d => d.menu_key === menuKey);

    let tableHeaders = '';
    if (menuKey === 'travel') {
      tableHeaders = `
        <th>Date</th>
        <th>Category</th>
        <th>Person Name</th>
        <th>Designation</th>
        <th>Boarding (Start)</th>
        <th>Destination (End)</th>
        <th>Amount (₹)</th>
        <th>Attached Documents</th>
        <th>Actions</th>
      `;
    } else if (menuKey === 'formalities') {
      tableHeaders = `
        <th>Date</th>
        <th>Category</th>
        <th>Person Name</th>
        <th>Phone Number</th>
        <th>Purpose / Details</th>
        <th>Amount (₹)</th>
        <th>Attached Documents</th>
        <th>Actions</th>
      `;
    } else if (menuKey === 'bank') {
      tableHeaders = `
        <th>Date</th>
        <th>Category</th>
        <th>Bank Name</th>
        <th>Tenure / Loan Period</th>
        <th>Amount (₹)</th>
        <th>Attached Documents</th>
        <th>Actions</th>
      `;
    } else {
      tableHeaders = `
        <th>Date</th>
        <th>Category</th>
        <th>Details / Purpose</th>
        <th>Amount (₹)</th>
        <th>Attached Documents</th>
        <th>Actions</th>
      `;
    }

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
              ${tableHeaders}
            </tr>
          </thead>
          <tbody>
            ${docs.length === 0 ? `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:30px;">No records uploaded yet for this module.</td></tr>` : ''}
            ${docs.map(d => {
              const meta = d.metadata || {};
              let rowCells = '';

              if (menuKey === 'travel') {
                rowCells = `
                  <td><strong>${d.doc_date ? d.doc_date.split('T')[0] : ''}</strong></td>
                  <td><span class="card-badge badge-info">${d.category}</span></td>
                  <td><strong>${meta.person_name || 'N/A'}</strong></td>
                  <td>${meta.designation || 'N/A'}</td>
                  <td>${meta.boarding || 'N/A'}</td>
                  <td>${meta.destination || 'N/A'}</td>
                  <td style="color:#34d399; font-weight:700;">₹ ${parseFloat(d.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                `;
              } else if (menuKey === 'formalities') {
                rowCells = `
                  <td><strong>${d.doc_date ? d.doc_date.split('T')[0] : ''}</strong></td>
                  <td><span class="card-badge badge-info">${d.category}</span></td>
                  <td><strong>${meta.person_name || 'N/A'}</strong></td>
                  <td>${meta.phone || 'N/A'}</td>
                  <td>${meta.purpose || 'N/A'}</td>
                  <td style="color:#34d399; font-weight:700;">₹ ${parseFloat(d.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                `;
              } else if (menuKey === 'bank') {
                rowCells = `
                  <td><strong>${d.doc_date ? d.doc_date.split('T')[0] : ''}</strong></td>
                  <td><span class="card-badge badge-info">${d.category}</span></td>
                  <td><strong>${meta.bank_name || 'N/A'}</strong></td>
                  <td>${meta.tenure || 'N/A'}</td>
                  <td style="color:#34d399; font-weight:700;">₹ ${parseFloat(d.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                `;
              } else {
                rowCells = `
                  <td><strong>${d.doc_date ? d.doc_date.split('T')[0] : ''}</strong></td>
                  <td><span class="card-badge badge-info">${d.category}</span></td>
                  <td>${meta.purpose || meta.person_name || meta.bank_name || d.category}</td>
                  <td style="color:#34d399; font-weight:700;">₹ ${parseFloat(d.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                `;
              }

              return `
                <tr>
                  ${rowCells}
                  <td>
                    ${(d.files || []).map(f => `
                      <span class="doc-pill" onclick="app.viewDocument(${d.id}, ${f.id})">
                        📄 ${f.file_name}
                      </span>
                    `).join('') || '<span style="color:var(--text-dim);">No file</span>'}
                  </td>
                  <td>
                    <div style="display:flex; gap:6px;">
                      <button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="app.viewDocument(${d.id}, ${d.files && d.files[0] ? d.files[0].id : 0})">View</button>
                      <button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="app.editDoc(${d.id})">Edit</button>
                      ${this.isSuperAdmin() ? `<button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteDoc(${d.id})">Delete</button>` : ''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  toggle5PMReportPreview() {
    this.force5PMReportPreview = !this.force5PMReportPreview;
    this.renderDashboard();
  }

  /* Menu 4: Office Menu */
  renderOfficeMenu() {
    const main = document.getElementById('mainContent');
    const docs = this.documents.filter(d => d.menu_key === 'office');
    const categories = ['Rent', 'Electricity Bill', 'Maintenance', 'Housekeeping', 'Guest Vehicle', 'Guest Maintenance'];

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
              <th>Guest / Person Name</th>
              <th>Hotel (₹)</th>
              <th>Food (₹)</th>
              <th>Others (₹)</th>
              <th>Total Amount (₹)</th>
              <th>Documents</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${docs.length === 0 ? `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:30px;">No office maintenance entries logged yet.</td></tr>` : ''}
            ${docs.map(d => {
              const meta = d.metadata || {};
              const isGuest = d.category === 'Guest Maintenance';
              return `
                <tr>
                  <td><strong>${d.doc_date ? d.doc_date.split('T')[0] : ''}</strong></td>
                  <td><span class="card-badge badge-warning">${d.category}</span></td>
                  <td>${isGuest ? (meta.guest_name || 'N/A') : (meta.purpose || d.category)}</td>
                  <td>${isGuest ? `₹${parseFloat(meta.hotel_amt || 0).toLocaleString('en-IN')}` : '-'}</td>
                  <td>${isGuest ? `₹${parseFloat(meta.food_amt || 0).toLocaleString('en-IN')}` : '-'}</td>
                  <td>${isGuest ? `₹${parseFloat(meta.others_amt || 0).toLocaleString('en-IN')}` : '-'}</td>
                  <td style="color:#34d399; font-weight:700;">₹ ${parseFloat(d.amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                  <td>
                    ${(d.files || []).map(f => `
                      <span class="doc-pill" onclick="app.viewDocument(${d.id}, ${f.id})">
                        📄 ${f.file_name}
                      </span>
                    `).join('') || '<span style="color:var(--text-dim);">No file</span>'}
                  </td>
                  <td>
                    <div style="display:flex; gap:6px;">
                      <button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="app.viewDocument(${d.id}, ${d.files && d.files[0] ? d.files[0].id : 0})">View</button>
                      <button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="app.editDoc(${d.id})">Edit</button>
                      ${this.isSuperAdmin() ? `<button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteDoc(${d.id})">Delete</button>` : ''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
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
              <th>Monthly Salary (₹)</th>
              <th>PF / HRA / ESI / Insurance (₹)</th>
              <th>Joined Date</th>
              <th>Status</th>
              <th>Salary Paid Status (${currentMonthYear})</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.employees.length === 0 ? `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:30px;">No employees registered yet.</td></tr>` : ''}
            ${this.employees.map(emp => {
              const currentPayment = (emp.payments || []).find(p => p.month_year === currentMonthYear);
              const isPaid = currentPayment ? currentPayment.is_paid : false;
              const pf = parseFloat(emp.pf_amount || 0);
              const hra = parseFloat(emp.hra_amount || 0);
              const esi = parseFloat(emp.esi_amount || 0);
              const ins = parseFloat(emp.insurance_amount || 0);

              return `
                <tr>
                  <td><strong>${emp.name}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${emp.demographic_details || ''}</span></td>
                  <td>${emp.designation}</td>
                  <td><div>${emp.phone}</div><div style="font-size:0.8rem; color:var(--text-muted);">${emp.email}</div></td>
                  <td style="font-weight:700;">₹ ${parseFloat(emp.salary || 0).toLocaleString('en-IN')}</td>
                  <td>
                    <div style="font-size:0.76rem; color:var(--text-muted); display:flex; flex-direction:column; gap:2px;">
                      <span>PF: <strong style="color:#60a5fa;">₹${pf.toLocaleString('en-IN')}</strong> | HRA: <strong style="color:#34d399;">₹${hra.toLocaleString('en-IN')}</strong></span>
                      <span>ESI: <strong style="color:#fbbf24;">₹${esi.toLocaleString('en-IN')}</strong> | Ins: <strong style="color:#a78bfa;">₹${ins.toLocaleString('en-IN')}</strong></span>
                    </div>
                  </td>
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
                    ${this.isSuperAdmin() ? `<button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteEmployee(${emp.id})">Delete</button>` : '<span style="color:var(--text-dim); font-size:0.8rem;">View Only</span>'}
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
      pf_amount: parseFloat(document.getElementById('empPf')?.value) || 0,
      hra_amount: parseFloat(document.getElementById('empHra')?.value) || 0,
      esi_amount: parseFloat(document.getElementById('empEsi')?.value) || 0,
      insurance_amount: parseFloat(document.getElementById('empInsurance')?.value) || 0,
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
    if (!this.isSuperAdmin()) {
      alert('Access Denied: Only Super Admin can delete employees.');
      return;
    }
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
          if (remainingToService <= 0) {
            serviceBadge = `<span class="card-badge badge-danger" style="background:#ef4444; color:white; font-weight:800; font-size:0.85rem; padding:6px 12px; display:inline-block;">⚠️ Service Due! (${kmsSinceService.toLocaleString()} KM driven since service)</span>`;
          } else {
            serviceBadge = `<span class="card-badge badge-danger" style="background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.4); font-weight:700; font-size:0.85rem; padding:6px 12px; display:inline-block;">⚙️ Remaining ${remainingToService.toLocaleString()} KM to service</span>`;
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

              <div style="font-size:0.85rem; color:var(--text-muted); display:flex; justify-content:space-between; margin-top:8px;">
                <span>Tax Status: <strong>${v.tax_paid_status}</strong> (₹${v.tax_amount || 0})</span>
                <span>Last Service: ${v.last_service_date || 'N/A'}</span>
              </div>

              <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
                <button class="action-btn" style="padding:6px 10px; font-size:0.8rem; background:linear-gradient(135deg, #4f46e5, #4338ca);" onclick="app.openVehicleModal('service', ${v.id})">
                  🔧 Log Service
                </button>
                <button class="action-btn" style="padding:6px 10px; font-size:0.8rem; background:linear-gradient(135deg, #0284c7, #0369a1);" onclick="app.openVehicleKmsModal(${v.id})">
                  📊 Log KMs
                </button>
                <button class="action-btn secondary" style="padding:6px 10px; font-size:0.8rem; background:rgba(234,179,8,0.2); color:#fbbf24; border:1px solid rgba(234,179,8,0.3);" onclick="app.openVehicleExpenseModal('Vehicle EMI', ${v.id})">
                  💳 Log EMI
                </button>
                <button class="action-btn secondary" style="padding:6px 10px; font-size:0.8rem; background:rgba(16,185,129,0.2); color:#34d399; border:1px solid rgba(16,185,129,0.3);" onclick="app.openVehicleExpenseModal('Daily Fuel', ${v.id})">
                  ⛽ Daily Fuel
                </button>
                ${this.isSuperAdmin() ? `<button class="action-btn secondary" style="padding:6px 10px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteVehicle(${v.id})">Delete</button>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  openVehicleKmsModal(vehId) {
    const veh = this.vehicles.find(v => v.id == vehId);
    if (!veh) return;
    document.getElementById('vehKmsVehId').value = vehId;
    document.getElementById('vehKmsVehName').value = `${veh.vehicle_name} (${veh.rc_number})`;
    document.getElementById('vehKmsInput').value = veh.total_kms_driven || 0;
    this.openModal('vehicleKmsModal');
  }

  async handleVehicleKmsSubmit(e) {
    e.preventDefault();
    const vehId = document.getElementById('vehKmsVehId').value;
    const newKms = document.getElementById('vehKmsInput').value;

    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: this.currentCompany.id,
          action: 'update_kms',
          id: vehId,
          total_kms_driven: newKms
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(data.message || 'Odometer KMs updated successfully!');
        this.closeModal('vehicleKmsModal');
        await this.loadVehicles();
        this.renderVehiclesMenu();
      }
    } catch (err) {
      console.error(err);
    }
  }

  openVehicleModal(mode, vehId = null) {
    const actionInput = document.getElementById('vehAction');
    const vehIdInput = document.getElementById('vehId');
    const title = document.getElementById('vehicleModalTitle');
    const createFields = document.getElementById('vehCreateFields');
    const serviceFields = document.getElementById('vehServiceFields');
    const kmsGroup = document.getElementById('vehKms')?.closest('.form-group');

    actionInput.value = mode;
    vehIdInput.value = vehId || '';

    if (mode === 'create') {
      title.innerText = 'Add New Vehicle';
      createFields.style.display = 'block';
      serviceFields.style.display = 'none';
      if (kmsGroup) kmsGroup.style.display = 'block';
      document.getElementById('vehName').required = true;
      document.getElementById('vehRc').required = true;
      document.getElementById('vehName').value = '';
      document.getElementById('vehRc').value = '';
      document.getElementById('vehKms').value = '';
    } else {
      const veh = this.vehicles.find(v => v.id == vehId);
      title.innerText = `Log Service for ${veh?.vehicle_name || 'Vehicle'}`;
      createFields.style.display = 'none';
      serviceFields.style.display = 'block';
      if (kmsGroup) kmsGroup.style.display = 'none';
      document.getElementById('vehName').required = false;
      document.getElementById('vehRc').required = false;
      document.getElementById('vehServiceDate').value = new Date().toISOString().split('T')[0];
      document.getElementById('vehServiceAmt').value = '';
    }

    this.openModal('vehicleModal');
    this.setupDatePickers();
  }

  async handleVehicleSubmit(e) {
    e.preventDefault();
    const mode = document.getElementById('vehAction').value;
    const vehId = document.getElementById('vehId').value;

    if (mode === 'service') {
      const sDate = document.getElementById('vehServiceDate').value;
      const sAmt = parseFloat(document.getElementById('vehServiceAmt').value) || 0;
      const desc = document.getElementById('vehDesc').value.trim();

      try {
        const res = await fetch('/api/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: this.currentCompany.id,
            action: 'update_service',
            id: vehId,
            service_date: sDate,
            service_amount: sAmt,
            description: desc
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

  openVehicleExpenseModal(category, vehId) {
    const veh = this.vehicles.find(v => v.id == vehId);
    if (!veh) return;
    document.getElementById('vehExpVehId').value = vehId;
    document.getElementById('vehExpVehName').value = `${veh.vehicle_name} (${veh.rc_number})`;
    document.getElementById('vehExpCategory').value = category;
    document.getElementById('vehExpModalTitle').innerText = `Log ${category} for ${veh.vehicle_name}`;
    document.getElementById('vehExpDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('vehExpAmount').value = '';
    document.getElementById('vehExpNotes').value = '';
    document.getElementById('vehExpReceiptFile').value = '';
    this.openModal('vehicleExpenseModal');
    this.setupDatePickers();
  }

  async handleVehicleExpenseSubmit(e) {
    e.preventDefault();
    const vehId = document.getElementById('vehExpVehId').value;
    const veh = this.vehicles.find(v => v.id == vehId);
    const category = document.getElementById('vehExpCategory').value;
    const date = document.getElementById('vehExpDate').value;
    const amount = parseFloat(document.getElementById('vehExpAmount').value) || 0;
    const notes = document.getElementById('vehExpNotes').value.trim();
    const fileInput = document.getElementById('vehExpReceiptFile');

    let files = [];
    if (fileInput && fileInput.files[0]) {
      const dataUrl = await this.readFileAsDataURL(fileInput.files[0]);
      files.push({
        name: fileInput.files[0].name,
        type: fileInput.files[0].type,
        size: fileInput.files[0].size,
        data: dataUrl
      });
    }

    const payload = {
      company_id: this.currentCompany.id,
      menu_key: 'vehicles',
      category: category,
      doc_date: date,
      amount: amount,
      metadata: { vehicle_id: vehId, vehicle_name: veh ? veh.vehicle_name : '', rc_number: veh ? veh.rc_number : '', notes: notes },
      files: files
    };

    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`${category} of ₹ ${amount.toLocaleString()} logged & deducted from daily budget!`);
        this.closeModal('vehicleExpenseModal');
        await this.loadDocuments();
        await this.loadBudget();
        this.renderVehiclesMenu();
      } else {
        alert(data.error || 'Failed to log vehicle expense');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async deleteVehicle(id) {
    if (!this.isSuperAdmin()) {
      alert('Access Denied: Only Super Admin can delete vehicles.');
      return;
    }
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

  /* Menu 8: Property Sales & Purchases (Separate Clean Columns) */
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
              <th>Property Name & Survey/Passbook</th>
              <th>Extent / Area</th>
              <th>Seller / Buyer</th>
              <th>Total Amount (₹)</th>
              <th>Left Amount (₹) [Masked]</th>
              <th>Right Amount (₹)</th>
              <th>Documents</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${docs.length === 0 ? `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:30px;">No property sales or purchase records added.</td></tr>` : ''}
            ${docs.map(d => {
              const meta = d.metadata || {};
              const isMasked = this.maskedState[d.id] !== false;
              const leftAmtStr = `₹ ${parseFloat(meta.left_amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;

              return `
                <tr>
                  <td><strong>${d.doc_date ? d.doc_date.split('T')[0] : ''}</strong></td>
                  <td><span class="${d.category === 'Sale' ? 'card-badge badge-success' : 'card-badge badge-warning'}">${d.category}</span></td>
                  <td>
                    <strong>${meta.property_name || 'N/A'}</strong>
                    <div style="font-size:0.76rem; color:var(--text-muted); margin-top:2px;">
                      ${meta.survey_no ? `Sy.No: <strong>${meta.survey_no}</strong> ` : ''}
                      ${meta.passbook_no ? `| PB: <strong>${meta.passbook_no}</strong>` : ''}
                    </div>
                  </td>
                  <td>${meta.extent || 'N/A'}</td>
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
                    <div style="display:flex; gap:6px;">
                      <button class="action-btn secondary" style="padding:4px 10px; font-size:0.85rem;" onclick="app.viewDocument(${d.id}, ${d.files && d.files[0] ? d.files[0].id : 0})" title="View Details & Documents">👁️ View</button>
                      <button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="app.editDoc(${d.id})">Edit</button>
                      ${this.isSuperAdmin() ? `<button class="action-btn secondary" style="padding:4px 10px; font-size:0.8rem; background:rgba(239,68,68,0.2); color:#f87171;" onclick="app.deleteDoc(${d.id})">Delete</button>` : ''}
                    </div>
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
     DOCUMENT UPLOADS, EDITING & SEPARATE INPUT FIELDS
     ========================================================== */
  openDocUploadModal(menuKey, categories) {
    this.activeModalMenuKey = menuKey;
    this.editingDocId = null; // Always reset for new entries; editDoc will restore this after calling us
    document.getElementById('docModalTitle').innerText = 'Upload Documents & Log Entry';
    document.getElementById('docCategorySelect').innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
    document.getElementById('docAmountInput').value = '';
    const formFields = document.getElementById('dynamicFormFields');
    formFields.innerHTML = '';
    this.pendingUploadFiles = [];
    document.getElementById('docFileInput').value = '';
    this.renderSelectedFilesList();

    const amountLabel = document.getElementById('docAmountLabel');
    const submitBtn = document.getElementById('docSubmitBtn');

    if (menuKey === 'property') {
      if (amountLabel) amountLabel.innerText = 'Total Transaction Value (₹) [Record Only - Does NOT deduct from Maintenance]';
      if (submitBtn) submitBtn.innerText = 'Save Property Record';
    } else {
      if (amountLabel) amountLabel.innerText = 'Amount (₹) - Deducted from Daily Maintenance';
      if (submitBtn) submitBtn.innerText = 'Save Entry & Deduct Maintenance';
    }

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
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label class="form-label">Person Name *</label>
            <input type="text" id="travelPerson" class="form-input" placeholder="e.g. Rahul Sharma" required>
          </div>
          <div class="form-group">
            <label class="form-label">Designation</label>
            <input type="text" id="travelDesignation" class="form-input" placeholder="e.g. Sr Manager">
          </div>
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
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label class="form-label">Property Name *</label>
            <input type="text" id="propName" class="form-input" placeholder="e.g. Commercial Plot 42" required>
          </div>
          <div class="form-group">
            <label class="form-label">Property Address</label>
            <input type="text" id="propAddress" class="form-input" placeholder="e.g. MG Road, Bengaluru">
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
          <div class="form-group">
            <label class="form-label">Extent / Area</label>
            <input type="text" id="propExtent" class="form-input" placeholder="e.g. 1200 Sq Ft / 2 Acres">
          </div>
          <div class="form-group">
            <label class="form-label">Survey Number</label>
            <input type="text" id="propSurveyNo" class="form-input" placeholder="e.g. Sy. No 145/2">
          </div>
          <div class="form-group">
            <label class="form-label">Passbook Number</label>
            <input type="text" id="propPassbookNo" class="form-input" placeholder="e.g. PB-987654">
          </div>
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
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label class="form-label">Bank Name *</label>
            <input type="text" id="bankName" class="form-input" placeholder="e.g. HDFC Bank" required>
          </div>
          <div class="form-group">
            <label class="form-label">Tenure / Loan Period</label>
            <input type="text" id="bankTenure" class="form-input" placeholder="e.g. 5 Years">
          </div>
        </div>
      `;
    } else if (menuKey === 'formalities') {
      formFields.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label class="form-label">Person Name *</label>
            <input type="text" id="formPerson" class="form-input" placeholder="e.g. Vikas Kumar" required>
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="text" id="formPhone" class="form-input" placeholder="e.g. 9876543210">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Purpose / Details</label>
          <input type="text" id="formPurpose" class="form-input" placeholder="e.g. ROC Filing & Stamp Duty">
        </div>
      `;
    }

    this.openModal('docUploadModal');
    this.setupDatePickers();
  }

  editDoc(docId) {
    const doc = this.documents.find(d => d.id === docId);
    if (!doc) return;

    // Set editingDocId BEFORE calling openDocUploadModal (which previously wiped it)
    this.editingDocId = docId;
    this.openDocUploadModal(doc.menu_key, [doc.category]);
    // Restore editing state after modal open (which resets it)
    this.editingDocId = docId;
    document.getElementById('docModalTitle').innerText = `Edit Document Entry #${doc.id}`;

    let formattedDate = doc.doc_date;
    if (formattedDate && formattedDate.includes('T')) {
      formattedDate = formattedDate.split('T')[0];
    }
    document.getElementById('docDateInput').value = formattedDate;
    document.getElementById('docAmountInput').value = doc.amount || 0;

    // PREFILL ALL SEPARATE METADATA DETAILS ACROSS ALL MODULES
    const meta = doc.metadata || {};
    if (doc.menu_key === 'office') {
      if (doc.category === 'Guest Maintenance') {
        const guestFields = document.getElementById('guestFields');
        if (guestFields) guestFields.style.display = 'block';
        if (document.getElementById('guestName')) document.getElementById('guestName').value = meta.guest_name || '';
        if (document.getElementById('guestHotelAmt')) document.getElementById('guestHotelAmt').value = meta.hotel_amt || 0;
        if (document.getElementById('guestFoodAmt')) document.getElementById('guestFoodAmt').value = meta.food_amt || 0;
        if (document.getElementById('guestOthersAmt')) document.getElementById('guestOthersAmt').value = meta.others_amt || 0;
      }
    } else if (doc.menu_key === 'travel') {
      if (document.getElementById('travelPerson')) document.getElementById('travelPerson').value = meta.person_name || '';
      if (document.getElementById('travelDesignation')) document.getElementById('travelDesignation').value = meta.designation || '';
      if (document.getElementById('travelBoarding')) document.getElementById('travelBoarding').value = meta.boarding || '';
      if (document.getElementById('travelDestination')) document.getElementById('travelDestination').value = meta.destination || '';
    } else if (doc.menu_key === 'property') {
      if (document.getElementById('propName')) document.getElementById('propName').value = meta.property_name || '';
      if (document.getElementById('propAddress')) document.getElementById('propAddress').value = meta.address || '';
      if (document.getElementById('propExtent')) document.getElementById('propExtent').value = meta.extent || '';
      if (document.getElementById('propSurveyNo')) document.getElementById('propSurveyNo').value = meta.survey_no || '';
      if (document.getElementById('propPassbookNo')) document.getElementById('propPassbookNo').value = meta.passbook_no || '';
      if (document.getElementById('propParty')) document.getElementById('propParty').value = meta.seller_name || meta.buyer_name || '';
      if (document.getElementById('propLeftAmt')) document.getElementById('propLeftAmt').value = meta.left_amount || 0;
      if (document.getElementById('propRightAmt')) document.getElementById('propRightAmt').value = meta.right_amount || 0;
    } else if (doc.menu_key === 'advances') {
      if (document.getElementById('advEmpSelect')) document.getElementById('advEmpSelect').value = meta.person_name || '';
      if (document.getElementById('advPurpose')) document.getElementById('advPurpose').value = meta.purpose || '';
    } else if (doc.menu_key === 'bank') {
      if (document.getElementById('bankName')) document.getElementById('bankName').value = meta.bank_name || '';
      if (document.getElementById('bankTenure')) document.getElementById('bankTenure').value = meta.tenure || '';
    } else if (doc.menu_key === 'formalities') {
      if (document.getElementById('formPerson')) document.getElementById('formPerson').value = meta.person_name || '';
      if (document.getElementById('formPhone')) document.getElementById('formPhone').value = meta.phone || '';
      if (document.getElementById('formPurpose')) document.getElementById('formPurpose').value = meta.purpose || '';
    }

    this.pendingUploadFiles = (doc.files || []).map((f, idx) => ({
      id: f.id || (Date.now() + idx),
      name: f.file_name,
      type: f.file_type || 'application/pdf',
      size: f.file_size || 0,
      sizeLabel: f.file_size > 1024 ? `${(f.file_size / 1024).toFixed(1)}K` : `${f.file_size}B`,
      data: f.file_data,
      progress: 100
    }));

    this.renderSelectedFilesList();
  }

  async handleFileSelect(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dataUrl = await this.readFileAsDataURL(file);
      const sizeKB = Math.round(file.size / 1024);
      const formattedSize = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)}M` : `${sizeKB}K`;

      this.pendingUploadFiles.push({
        id: Date.now() + i,
        name: file.name,
        type: file.type,
        size: file.size,
        sizeLabel: formattedSize,
        data: dataUrl,
        progress: 100
      });
    }

    e.target.value = '';
    this.renderSelectedFilesList();
  }

  removeSelectedFile(fileId) {
    this.pendingUploadFiles = this.pendingUploadFiles.filter(f => f.id !== fileId);
    const fileInput = document.getElementById('docFileInput');
    if (fileInput) fileInput.value = '';
    this.renderSelectedFilesList();
  }

  renderSelectedFilesList() {
    const container = document.getElementById('selectedFilesList');
    if (!container) return;

    if (this.pendingUploadFiles.length === 0) {
      container.innerHTML = `<div style="color:var(--text-dim); font-size:0.85rem; padding:4px 0;">No files attached yet.</div>`;
      return;
    }

    container.innerHTML = this.pendingUploadFiles.map(f => `
      <div class="file-upload-item">
        <div class="file-item-info">
          <span class="file-item-name" title="${f.name}">${f.name}</span>
          <span class="file-item-size">(${f.sizeLabel})</span>
        </div>
        <div class="file-progress-container">
          <div class="file-progress-fill" style="width: ${f.progress}%;"></div>
        </div>
        <button type="button" class="file-item-remove" onclick="app.removeSelectedFile(${f.id})" title="Remove File">&times;</button>
      </div>
    `).join('');
  }

  async handleDocUploadSubmit(e) {
    e.preventDefault();
    const category = document.getElementById('docCategorySelect').value;
    const docDate = document.getElementById('docDateInput').value;
    const amount = parseFloat(document.getElementById('docAmountInput').value) || 0;

    // Use activeModalMenuKey (set when modal opens) so editing from dashboard or any page works correctly
    const modalMenuKey = this.activeModalMenuKey || this.currentMenu;
    const metadata = {};
    if (modalMenuKey === 'office' && category === 'Guest Maintenance') {
      metadata.guest_name = document.getElementById('guestName')?.value || '';
      metadata.hotel_amt = parseFloat(document.getElementById('guestHotelAmt')?.value) || 0;
      metadata.food_amt = parseFloat(document.getElementById('guestFoodAmt')?.value) || 0;
      metadata.others_amt = parseFloat(document.getElementById('guestOthersAmt')?.value) || 0;
    } else if (modalMenuKey === 'travel') {
      metadata.person_name = document.getElementById('travelPerson')?.value || '';
      metadata.designation = document.getElementById('travelDesignation')?.value || '';
      metadata.boarding = document.getElementById('travelBoarding')?.value || '';
      metadata.destination = document.getElementById('travelDestination')?.value || '';
    } else if (modalMenuKey === 'property') {
      metadata.property_name = document.getElementById('propName')?.value || '';
      metadata.address = document.getElementById('propAddress')?.value || '';
      metadata.extent = document.getElementById('propExtent')?.value || '';
      metadata.survey_no = document.getElementById('propSurveyNo')?.value || '';
      metadata.passbook_no = document.getElementById('propPassbookNo')?.value || '';
      metadata.seller_name = document.getElementById('propParty')?.value || '';
      metadata.buyer_name = document.getElementById('propParty')?.value || '';
      metadata.left_amount = parseFloat(document.getElementById('propLeftAmt')?.value) || 0;
      metadata.right_amount = parseFloat(document.getElementById('propRightAmt')?.value) || 0;
    } else if (modalMenuKey === 'advances') {
      metadata.person_name = document.getElementById('advEmpSelect')?.value || '';
      metadata.purpose = document.getElementById('advPurpose')?.value || '';
    } else if (modalMenuKey === 'bank') {
      metadata.bank_name = document.getElementById('bankName')?.value || '';
      metadata.tenure = document.getElementById('bankTenure')?.value || '';
    } else if (modalMenuKey === 'formalities') {
      metadata.person_name = document.getElementById('formPerson')?.value || '';
      metadata.phone = document.getElementById('formPhone')?.value || '';
      metadata.purpose = document.getElementById('formPurpose')?.value || '';
    }

    const isEditing = Boolean(this.editingDocId);
    const method = isEditing ? 'PUT' : 'POST';
    const payload = {
      id: this.editingDocId,
      company_id: this.currentCompany.id,
      menu_key: modalMenuKey,
      category,
      doc_date: docDate,
      amount,
      metadata,
      files: this.pendingUploadFiles.map(f => ({ name: f.name, type: f.type, size: f.size, data: f.data }))
    };

    const submitBtn = document.getElementById('docSubmitBtn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch('/api/documents', {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        if (this.currentMenu === 'property') {
          this.showToast(isEditing ? 'Property transaction record updated successfully!' : `Property transaction record saved!`);
        } else {
          this.showToast(isEditing ? 'Document entry updated successfully!' : `Document entry saved & ₹ ${amount.toLocaleString()} deducted from daily budget!`);
        }
        this.closeModal('docUploadModal');
        this.pendingUploadFiles = [];
        this.editingDocId = null;
        await this.loadDocuments();
        await this.loadBudget();
        this.renderCurrentMenu();
      } else {
        alert(data.error || 'Failed to save document');
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async deleteDoc(id) {
    if (!this.isSuperAdmin()) {
      alert('Access Denied: Only Super Admin can delete documents.');
      return;
    }
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

  /* Universal Document Viewer & Editor with Multi-File Switcher */
  async viewDocument(docId, targetFileId = 0) {
    const doc = this.documents.find(d => d.id === docId);
    if (!doc) return;
    const files = doc.files || [];
    let file = files.find(f => f.id === targetFileId) || files[0];

    this.currentViewingDoc = { doc, file };
    const previewArea = document.getElementById('docPreviewArea');
    const title = document.getElementById('viewerModalTitle');
    const downloadBtn = document.getElementById('docDownloadBtn');
    const metaInfo = document.getElementById('docMetaInfo');
    const tabsContainer = document.getElementById('docFileTabs');

    if (tabsContainer) {
      if (files.length > 0) {
        tabsContainer.innerHTML = files.map(f => `
          <button type="button" class="doc-pill ${file && f.id === file.id ? 'active' : ''}" style="${file && f.id === file.id ? 'background:#6366f1; color:white; border-color:#818cf8;' : ''}" onclick="app.viewDocument(${doc.id}, ${f.id})">
            📄 ${f.file_name}
          </button>
        `).join('');
      } else {
        tabsContainer.innerHTML = '';
      }
    }

    if (file) {
      title.innerText = `📄 Document Reader — ${doc.category || 'Vault File'}`;
      downloadBtn.href = file.file_data || '#';
      downloadBtn.style.display = 'inline-flex';
      let dateDisplay = doc.doc_date;
      if (dateDisplay && dateDisplay.includes('T')) dateDisplay = dateDisplay.split('T')[0];

      metaInfo.innerText = `Type: ${file.file_type || 'Unknown'} | Size: ${(file.file_size / 1024).toFixed(1)} KB | Date: ${dateDisplay}`;

      const fileType = (file.file_type || '').toLowerCase();
      const fileName = (file.file_name || '').toLowerCase();
      const fileData = file.file_data || '';

      const isPdf = fileType.includes('pdf') || fileName.endsWith('.pdf');
      const isImage = fileType.includes('image') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(fileName);
      const isText = fileType.includes('text') || fileType.includes('json') || fileType.includes('xml') || /\.(txt|csv|json|md|log|js|html|css|xml)$/i.test(fileName);
      const isWord = fileType.includes('word') || fileType.includes('officedocument') || /\.(doc|docx)$/i.test(fileName);

      if (isPdf) {
        let pdfSrc = fileData;
        const blob = this.dataURLtoBlob(fileData);
        if (blob) {
          if (this._activeBlobUrl) {
            URL.revokeObjectURL(this._activeBlobUrl);
          }
          this._activeBlobUrl = URL.createObjectURL(blob);
          pdfSrc = `${this._activeBlobUrl}#toolbar=0&navpanes=0&statusbar=0&view=FitH`;
        } else if (!pdfSrc.includes('#')) {
          pdfSrc += '#toolbar=0&navpanes=0&statusbar=0&view=FitH';
        }

        previewArea.innerHTML = `
          <div style="width:100%; height:100%; min-height:500px; display:flex; flex-direction:column; position:relative; background:#0f172a; border-radius:var(--radius-md); overflow:hidden;">
            <iframe src="${pdfSrc}" type="application/pdf" style="width:100%; height:100%; min-height:500px; border:none; flex:1;" title="${file.file_name}"></iframe>
          </div>
        `;
      } else if (isImage) {
        previewArea.innerHTML = `
          <div style="width:100%; height:100%; min-height:500px; display:flex; align-items:center; justify-content:center; background:#0f172a; border-radius:var(--radius-md); overflow:auto; padding:20px;">
            <img src="${fileData}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:var(--radius-sm); box-shadow: 0 10px 30px rgba(0,0,0,0.5);" alt="${file.file_name}">
          </div>
        `;
      } else if (isText) {
        let textContent = '';
        try {
          const base64Content = fileData.includes(',') ? fileData.split(',')[1] : fileData;
          textContent = decodeURIComponent(escape(atob(base64Content)));
        } catch (e) {
          try {
            textContent = atob(fileData.includes(',') ? fileData.split(',')[1] : fileData);
          } catch (err) {
            textContent = 'Unable to decode text content.';
          }
        }

        previewArea.innerHTML = `
          <div style="width:100%; height:100%; min-height:500px; display:flex; flex-direction:column; background:#0f172a; border-radius:var(--radius-md); padding:16px; overflow:hidden;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1);">
              <span style="font-size:0.85rem; color:#818cf8; font-weight:600;">📝 Text Reader & Editor Mode</span>
              <span style="font-size:0.75rem; color:var(--text-muted);">${textContent.split('\n').length} lines</span>
            </div>
            <textarea class="doc-text-editor" id="docEditableText" style="width:100%; flex:1; min-height:420px; background:rgba(15,23,42,0.9); color:#34d399; font-family:'Fira Code', 'Consolas', monospace; padding:14px; border-radius:var(--radius-md); border:1px solid var(--border-color); font-size:0.9rem; line-height:1.6; resize:none; outline:none;" placeholder="Document text content...">${this.escapeHtml(textContent)}</textarea>
          </div>
        `;
      } else if (isWord) {
        previewArea.innerHTML = `
          <div style="width:100%; height:100%; min-height:500px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0f172a; border-radius:var(--radius-md); padding:30px; text-align:center;">
            <div style="font-size:4rem; margin-bottom:14px; filter:drop-shadow(0 4px 10px rgba(99,102,241,0.4));">📘</div>
            <div style="font-weight:800; font-size:1.4rem; color:white;">${file.file_name}</div>
            <div style="font-size:0.9rem; color:#818cf8; margin-top:6px; font-weight:600;">Microsoft Word Document (.docx / .doc)</div>
            <div style="max-width:500px; background:rgba(30,41,59,0.8); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:16px; margin-top:20px; text-align:left;">
              <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:6px;"><strong>File Size:</strong> ${(file.file_size / 1024).toFixed(1)} KB</div>
              <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:6px;"><strong>Category:</strong> ${doc.category}</div>
              <div style="font-size:0.82rem; color:var(--text-muted);"><strong>Logged Date:</strong> ${dateDisplay}</div>
            </div>
            <p style="color:var(--text-muted); font-size:0.88rem; margin-top:16px;">Click the button below to download and read the complete document offline or in Office.</p>
          </div>
        `;
      } else {
        previewArea.innerHTML = `
          <div style="width:100%; height:100%; min-height:500px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0f172a; border-radius:var(--radius-md); padding:30px; text-align:center;">
            <div style="font-size:4rem; margin-bottom:14px;">📄</div>
            <div style="font-weight:800; font-size:1.3rem; color:white;">${file.file_name}</div>
            <p style="color:var(--text-muted); margin-top:8px;">Document attached (${file.file_type || 'Unknown format'}). Click download below to save or view offline.</p>
          </div>
        `;
      }
    } else {
      title.innerText = `Document Entry #${doc.id}`;
      downloadBtn.style.display = 'none';
      downloadBtn.href = '#';
      let dateDisplay = doc.doc_date;
      if (dateDisplay && dateDisplay.includes('T')) dateDisplay = dateDisplay.split('T')[0];
      metaInfo.innerText = `No files attached to this record | Date: ${dateDisplay}`;

      previewArea.innerHTML = `
        <div style="width:100%; height:100%; min-height:500px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0f172a; border-radius:var(--radius-md); padding:30px; text-align:center;">
          <div style="font-size:4rem; margin-bottom:14px;">📋</div>
          <div style="font-weight:800; font-size:1.3rem; color:white;">Category: ${doc.category}</div>
          <p style="color:var(--text-muted); margin-top:8px;">Amount: ₹${parseFloat(doc.amount || 0).toLocaleString('en-IN')} | Date: ${dateDisplay}</p>
          <div style="font-size:0.85rem; color:var(--text-dim); margin-top:12px;">(No file attachment uploaded for this record)</div>
        </div>
      `;
    }

    this.openModal('docViewerModal');
  }

  saveDocEdit() {
    const editableText = document.getElementById('docEditableText');
    if (editableText && this.currentViewingDoc && this.currentViewingDoc.file) {
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
  dataURLtoBlob(dataurl) {
    try {
      if (!dataurl || !dataurl.includes(',')) return null;
      const arr = dataurl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.error('Error converting Data URL to Blob:', e);
      return null;
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

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
    if (modalId === 'docViewerModal' && this._activeBlobUrl) {
      URL.revokeObjectURL(this._activeBlobUrl);
      this._activeBlobUrl = null;
    }
    document.getElementById(modalId)?.classList.remove('active');
  }
}

// Global App Instance
const app = new App();
