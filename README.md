# 🏢 Multi-Company Asset & Document Management System

A comprehensive, enterprise-grade web application built for multi-company asset tracking, document vault management, daily maintenance budget allocation, vehicle service alerts, HR payroll, and real-time financial tracking.

> 🌐 **Official Website**: [https://inspenox.in](https://inspenox.in)  
> 📦 **GitHub Repository**: [https://github.com/Inpenox2025/assetmanager](https://github.com/Inpenox2025/assetmanager)

---

## 🌟 Overview & Highlights

- **Multi-Tenant / Multi-Company Isolation**: Complete data segregation for multiple companies under a single platform.
- **Role-Based Access Control (RBAC)**: Fine-grained user access separating **Super Admin**, **Company Admin**, and **Employee** roles.
- **Daily Maintenance Budget Engine**: Real-time tracking of daily maintenance allocations with **automatic unspent balance carry-over** to subsequent days.
- **Vehicle Service Alerts**: Fleet monitoring that automatically flags vehicles requiring service upon reaching the **10,000 KM threshold**.
- **Document Vault & Inline Reader**: Multi-file attachment engine supporting PDF, PNG/JPEG, DOCX, and TXT documents. Features an **expanded viewport modal (1120px)** with an **embedded clean PDF reader** (with print/toolbar controls hidden for focused reading) and interactive multi-tab switcher.
- **Dual Database Architecture**: Seamlessly runs with **Vercel PostgreSQL (Neon DB)** in production or an **In-Memory Mock Database Store** for instant offline local development.

---

## 🚀 Key Modules & Features

### 1. 📈 Executive Overview Dashboard
- **Financial & KPI Cards**: Real-time view of today's maintenance balance, total uploaded files/documents, active HR roster size, and vehicle fleet alerts.
- **Module Financial Breakdown**: Summary of total monetary entries across all 10 specialized management modules.
- **Vehicle Maintenance Warning Banner**: Instant alert highlighting vehicles that have reached or passed their service mileage threshold.
- **Recent Upload Activity**: Live feed of recently uploaded documents with quick view, edit, and delete controls.

---

### 2. 💰 Daily Maintenance Budget Manager
- **Daily Budget Bar Widget**: Top sticky bar showing today's budget set, carried-over balance, total spent today, and net remaining balance.
- **Automatic Rollover**: Unspent budget balance automatically rolls over to increase the available budget for the following day.
- **Historical Budget Ledger**: Date-wise log of set amounts, carried-over amounts, total available funds, expenses, remaining balances, and custom notes.
- **Budget Health Indicators**: Automated budget status badges (🟢 Healthy `<60%`, 🟡 Moderate `60-90%`, 🔴 Critical `>90%`).
- **Date Range & Company Filtering**: Filter budget records by date range (`From` / `To`) and company (Super Admin view).

---

### 3. 📁 Document Vault & 10 Specialized Functional Modules

The platform organizes corporate records across 10 specialized menu sections with custom category tags and metadata:

| Module | Icon | Key Features & Description |
| :--- | :---: | :--- |
| **Menu 1: ITR** | 📊 | Income Tax Return filings, Audit Reports, and Paid-Up Capital records with document attachments and assessment year tracking. |
| **Menu 2: GST** | 🧾 | GST Return logs and GST Paid statements. Features a top ticker alert for 15-day GST filing reminders. |
| **Menu 3: Bank** | 🏦 | Loan account management, monthly EMI schedule tracking, payment receipts, and bank transaction logs. |
| **Menu 4: Office** | 🏢 | Office maintenance expenses, utility bills, facility repairs, and operational expenditure documents. |
| **Menu 5: Employees** | 👥 | Full HR employee roster (designation, salary, email, phone, joining date, status) with monthly salary payment tracking (Paid / Unpaid status and date logged). |
| **Menu 6: Vehicles** | 🚗 | Vehicle fleet management with RC number tracking, cumulative KMs, last service KMs, tax payment status/amounts, service log history with document links, and **10,000 KM automated service alert**. |
| **Menu 7: Travelling Allowance** | ✈️ | Travel expense reimbursement management for Flight, Train, and Bus tickets with ticket attachments. |
| **Menu 8: Property** | 🏘️ | Property sales & purchases ledger (location, total cost, paid amount, remaining balance) with a **Mask/Unmask Balance Toggle** for privacy. |
| **Menu 9: Advances** | 💵 | Record short-term cash advances and salary advances issued to employees with disbursement dates. |
| **Menu 10: Formalities** | 📋 | Centralized compliance repository for company licenses, registration certificates, board resolutions, and legal agreements. |

---

### 4. ⚙️ Super Admin Control Panel
- **Company Management**: Add, edit, or delete companies; upload company logos (Base64), and manage GST numbers.
- **User Credential Provisioning**: Create and assign new user logins (Company Admins or Employees) to specific companies.
- **Global Password Reset**: Super Admins can reset credentials for any registered user.
- **Company Switcher**: Instant one-click context switching between companies for Super Admins.

---

### 5. 🔔 Ticker & Notification System
- **Top Alert Ticker**: Scrolling banner displaying critical operational alerts:
  - 🔔 GST filing cycle notifications (15-day reminders).
  - 📌 Daily budget configuration reminders.
  - 🚗 Vehicle 10,000 KM threshold service maintenance alerts.
- **Toast Notifications**: Color-coded feedback (Success ✅, Info ℹ️, Error ⚠️) for all user actions.

---

## 🛠️ Technology Stack

- **Frontend**:
  - **HTML5 & Vanilla JavaScript (ES6+ Class Architecture)**
  - **Vanilla CSS3**: Modern design system using dark mode aesthetic, CSS custom properties, glassmorphism, responsive drawer sidebar, custom modal dialogs, and smooth micro-animations.
  - **Google Fonts**: Inter typography.
- **Backend API**:
  - **Node.js & Express**: Lightweight local development server (`dev-server.js`).
  - **Vercel Serverless Functions**: Individual serverless endpoints located in the `/api` directory for serverless cloud deployment.
  - **Security**: `bcryptjs` for salted password hashing, `jsonwebtoken` (JWT) for stateless authentication.
- **Database & Storage**:
  - **PostgreSQL**: Primary production database utilizing `@neondatabase/serverless` (Neon DB).
  - **In-Memory SQL Mock Engine**: Built-in fallback engine allowing instant local testing without requiring a live database connection string.

---

## 📁 Project Architecture & File Structure

```
Asset mangement/
├── api/                        # Vercel Serverless API Handlers
│   ├── auth.js                 # Authentication & User Management (Login, Create User, Password Reset)
│   ├── budget.js               # Daily Budget CRUD & Historical Rollover Calculations
│   ├── companies.js            # Company Profile Management & Logo Storage
│   ├── documents.js            # Document Ledger & Multi-File Base64 Attachment Storage
│   ├── employees.js            # HR Employee Directory & Monthly Salary Payment Ledger
│   ├── setup.js                # Database Migration & Initial SuperAdmin Seeding
│   └── vehicles.js             # Vehicle Fleet Ledger & Service Log Management
├── shared/
│   └── db.js                   # Unified DB Layer (Neon Serverless SQL & In-Memory Fallback Store)
├── dev-server.js               # Local Express Development Server & Static Asset Router
├── index.html                  # Main Application Shell & UI Layouts
├── index.css                   # Comprehensive CSS Design System & Utility Classes
├── index.js                    # Core App Frontend Controller (State Management, DOM & APIs)
├── package.json                # Project Dependencies & Run Scripts
├── vercel.json                 # Vercel Serverless Deployment Routes & Rewrites
└── README.md                   # Project Documentation
```

---

## 🗄️ Database Schemas

The application manages the following primary entity relations:

```mermaid
erDiagram
    COMPANIES ||--o{ USERS : employ
    COMPANIES ||--o{ DAILY_BUDGETS : allocates
    COMPANIES ||--o{ DOCUMENTS : owns
    COMPANIES ||--o{ EMPLOYEES : hires
    COMPANIES ||--o{ VEHICLES : owns
    DOCUMENTS ||--o{ DOCUMENT_FILES : contains
    EMPLOYEES ||--o{ SALARY_PAYMENTS : receives
    VEHICLES  ||--o{ VEHICLE_SERVICE_LOGS : logs
    DOCUMENTS o|--o{ VEHICLE_SERVICE_LOGS : links
```

---

## 💻 Installation & Local Setup

### 1. Prerequisites
- **Node.js** (v16+ recommended)
- **npm** (comes bundled with Node.js)

### 2. Installation
Clone or download the project folder, then navigate to the root directory and install dependencies:

```bash
npm install
```

### 3. Running the Application Locally
Start the development server:

```bash
npm run dev
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 🔑 Default Login Credentials

Upon initializing the system or running locally in mock mode, the following Super Admin account is available:

- **Role**: Super Admin (All Companies Access)
- **Username**: `superadmin`
- **Password**: `admin123` *(or `inspenox2025` when initialized via `/api/setup`)*

---

## 🌐 Production Deployment (Vercel & Neon PostgreSQL)

1. **Deploy to Vercel**:
   Push the repository to GitHub/GitLab and import the project into Vercel.

2. **Configure Database Environment Variable**:
   In your Vercel Project Settings -> Environment Variables, add your Neon PostgreSQL connection string:
   ```env
   DATABASE_URL=postgres://user:password@ep-cool-db-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

3. **Initialize Database Tables**:
   Once deployed, trigger the database setup script to create all SQL tables and default admin credentials by invoking:
   ```http
   POST https://your-vercel-domain.vercel.app/api/setup
   ```
   *Or click the "Initialize DB & Tables" action within the admin portal.*

## 📄 License & Copyright

**Copyright © 2026 Inspenox. All Rights Reserved.**

🌐 **Official Website**: [https://inspenox.in](https://inspenox.in)  
📧 **Contact & Support**: [https://inspenox.in](https://inspenox.in)

This software and associated documentation files are the exclusive proprietary property of **Inspenox**. 

### 🚫 Restrictions & Protection
- **Unauthorized Copying Prohibited**: No part of this codebase, architecture, software, or design may be copied, reproduced, modified, republished, uploaded, posted, transmitted, or distributed in any form or by any means without prior explicit written permission from **Inspenox**.
- **Reverse Engineering**: Reverse engineering, decompiling, disassembling, or deriving source code or underlying algorithms from this application is strictly prohibited.
- **Commercial Usage**: Unauthorized commercial deployment, resale, sublicensing, or redistribution of this application is strictly forbidden under law.


