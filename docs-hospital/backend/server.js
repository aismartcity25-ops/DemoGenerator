const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/xperiments-hospital-docs', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Models
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'tech', 'medical_staff', 'viewer'], default: 'viewer' },
  hospitalType: { type: String, default: 'ospedale' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const configurationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hospitalType: { type: String, required: true },
  ehr: {
    connected: { type: Boolean, default: false },
    system: { type: String, default: '' },
    endpoint: { type: String, default: '' },
    credentials: { type: Object, default: {} }
  },
  cup: {
    connected: { type: Boolean, default: false },
    system: { type: String, default: '' },
    endpoint: { type: String, default: '' },
    credentials: { type: Object, default: {} }
  },
  departments: [{ type: Object }],
  services: [{ type: Object }],
  createdAt: { type: Date, default: Date.now }
});

const Configuration = mongoose.model('Configuration', configurationSchema);

// Auth Middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Access denied' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'hospital-secret');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Routes

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, name, role });
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'hospital-secret', { expiresIn: '24h' });
    
    res.json({ 
      message: 'User created successfully',
      token,
      user: { id: user._id, username: user.username, name: user.name, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'hospital-secret', { expiresIn: '24h' });
    
    res.json({ 
      message: 'Login successful',
      token,
      user: { id: user._id, username: user.username, name: user.name, role: user.role, hospitalType: user.hospitalType }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Configuration Routes
app.get('/api/config', auth, async (req, res) => {
  try {
    const config = await Configuration.findOne({ userId: req.user._id });
    res.json(config || { userId: req.user._id, hospitalType: req.user.hospitalType });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/config', auth, async (req, res) => {
  try {
    const configData = {
      ...req.body,
      userId: req.user._id,
      hospitalType: req.user.hospitalType
    };
    
    let config = await Configuration.findOne({ userId: req.user._id });
    if (config) {
      config = await Configuration.findOneAndUpdate(
        { userId: req.user._id },
        configData,
        { new: true, upsert: true }
      );
    } else {
      config = new Configuration(configData);
      await config.save();
    }
    
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// EHR Integration Routes
app.post('/api/ehr/test-connection', auth, async (req, res) => {
  try {
    const { baseUrl, authType, credentials } = req.body;
    
    // Simulate EHR connection test
    const connectionResult = {
      success: true,
      message: 'EHR connection successful',
      system: 'FHIR Server',
      version: '4.0.1',
      resources: ['Patient', 'Encounter', 'Observation', 'Procedure']
    };
    
    res.json(connectionResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ehr/patients', auth, async (req, res) => {
  try {
    // Simulate EHR patient data
    const patients = [
      {
        id: 'patient-001',
        name: 'Mario Rossi',
        birthDate: '1980-05-15',
        gender: 'male',
        active: true
      },
      {
        id: 'patient-002',
        name: 'Laura Bianchi',
        birthDate: '1975-12-20',
        gender: 'female',
        active: true
      }
    ];
    
    res.json(patients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CUP System Routes
app.post('/api/cup/test-connection', auth, async (req, res) => {
  try {
    const { baseUrl, systemType } = req.body;
    
    // Simulate CUP connection test
    const connectionResult = {
      success: true,
      message: 'CUP system connection successful',
      system: 'Regional CUP System',
      availableServices: ['Specialistica', 'Diagnostica', 'Visita Medica'],
      maxBookingDays: 90
    };
    
    res.json(connectionResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cup/services', auth, async (req, res) => {
  try {
    const services = [
      {
        id: 'service-001',
        name: 'Visita Specialistica',
        description: 'Visita specialistica di controllo',
        duration: 30,
        price: 100
      },
      {
        id: 'service-002',
        name: 'Esame del Sangue',
        description: 'Analisi ematologiche complete',
        duration: 15,
        price: 50
      }
    ];
    
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Departments Routes
app.get('/api/departments', auth, async (req, res) => {
  try {
    const departments = [
      {
        id: 'dept-001',
        name: 'Cardiologia',
        description: 'Reparto di cardiologia e cardiochirurgia',
        headDoctor: 'Dr. Marco Verdi',
        contact: '+39 0123 456789'
      },
      {
        id: 'dept-002',
        name: 'Pediatria',
        description: 'Reparto di pediatria e neonatologia',
        headDoctor: 'Dr. Laura Neri',
        contact: '+39 0123 456788'
      }
    ];
    
    res.json(departments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simulator Routes
app.post('/api/simulator/run', auth, async (req, res) => {
  try {
    const { scenario, parameters } = req.body;
    
    // Simulate different scenarios
    let result;
    
    switch (scenario) {
      case 'ehr_integration':
        result = {
          success: true,
          message: 'EHR integration test completed successfully',
          performance: {
            responseTime: '2.1s',
            throughput: '100 req/s',
            errors: 0
          },
          data: {
            patientsSynced: 1500,
            encountersSynced: 3200,
            observationsSynced: 8500
          }
        };
        break;
        
      case 'cup_booking':
        result = {
          success: true,
          message: 'CUP booking system test completed successfully',
          performance: {
            responseTime: '1.8s',
            throughput: '80 req/s',
            errors: 2
          },
          data: {
            bookingsCreated: 120,
            bookingsModified: 15,
            bookingsCancelled: 8
          }
        };
        break;
        
      default:
        result = {
          success: false,
          message: 'Unknown scenario'
        };
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🏥 Xperiments Hospital Documentation Server running on port ${PORT}`);
});

module.exports = app;