const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Import API routes
const setupHandler = require('./api/setup');
const authHandler = require('./api/auth');
const companiesHandler = require('./api/companies');
const documentsHandler = require('./api/documents');
const budgetHandler = require('./api/budget');
const employeesHandler = require('./api/employees');
const vehiclesHandler = require('./api/vehicles');

// Route mapping matching vercel.json
app.all('/api/setup', (req, res) => setupHandler(req, res));
app.all('/api/auth*', (req, res) => authHandler(req, res));
app.all('/api/companies*', (req, res) => companiesHandler(req, res));
app.all('/api/documents*', (req, res) => documentsHandler(req, res));
app.all('/api/budget*', (req, res) => budgetHandler(req, res));
app.all('/api/employees*', (req, res) => employeesHandler(req, res));
app.all('/api/vehicles*', (req, res) => vehiclesHandler(req, res));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '.')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Asset & Document Management Server Running!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
