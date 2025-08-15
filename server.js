const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const multer = require('multer');
const upload = multer();
const path = require('path');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static('uploads'));

// Static React build serve করুন
app.use(express.static(path.join(__dirname, '../frontend/build')));

// SPA route fallback (সব route frontend-এর index.html-এ যাবে)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

// Database Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error('MongoDB Connection Error:', err);
    process.exit(1);
  }
};

// Admin Model
const Admin = mongoose.model('Admin', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' }
}));

// Student Model (pending students)
const Student = mongoose.model('Student', new mongoose.Schema({
  studentId: String,
  cardType: String,
  firstName: String,
  lastName: String,
  email: String,
  program: String,
  requestType: String,
  photo: String,
  gdCopy: String,
  oldIdImage: String,
  documents: [String],
  status: { type: String, default: 'pending' }, // pending, approved, rejected
  rejectionReason: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}));

// Application Model (approved students)
const Application = mongoose.model(
  'Application',
  new mongoose.Schema({
    studentId: String,
    cardType: String,
    firstName: String,
    lastName: String,
    email: String,
    program: String,
    requestType: String,
    photo: String,
    gdCopy: String,
    oldIdImage: String,
    documents: [String],
    approvedAt: { type: Date, default: Date.now }
  }),
  'applications' // <-- collection name স্পষ্টভাবে দিন
);

// Create initial admin 
const createInitialAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ username: process.env.ADMIN_USERNAME });
    if (!adminExists && process.env.ADMIN_PASSWORD) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
      await Admin.create({
        username: process.env.ADMIN_USERNAME,
        password: hashedPassword
      });
      console.log('👑 Initial admin created');
    }
  } catch (error) {
    console.error('Admin creation error:', error);
  }
};

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ 
      token,
      admin: {
        id: admin._id,
        username: admin.username
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Protected Admin Routes
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Not authorized' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.adminId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Not authorized' });
  }
};

// Get pending applications (students with status 'pending')
app.get('/api/admin/dashboard', authMiddleware, async (req, res) => {
  try {
    const pendingApplications = await Student.find({ status: 'pending' });
    res.json({ pendingApplications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve or reject application
app.post('/api/admin/application/:id/action', authMiddleware, async (req, res) => {
  try {
    const { action, reason } = req.body; // action: 'approve' or 'reject'
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (action === 'approve') {
      // Move to Application collection
      await Application.create({
        studentId: student.studentId,
        cardType: student.cardType,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        program: student.program,
        requestType: student.requestType,
        photo: student.photo,
        gdCopy: student.gdCopy,
        oldIdImage: student.oldIdImage,
        documents: student.documents,
        approvedAt: new Date()
      });
      // Remove from Student collection
      await Student.findByIdAndDelete(student._id);
      return res.json({ message: 'Application approved' });
    } else if (action === 'reject') {
      // Update status to rejected and optionally save reason
      student.status = 'rejected';
      if (reason) student.rejectionReason = reason;
      await student.save();
      return res.json({ message: 'Application rejected' });
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new student (form submission)
app.post('/api/students', upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'gdCopy', maxCount: 1 },
  { name: 'oldIdImage', maxCount: 1 },
  // প্রয়োজন হলে আরও file ফিল্ড যোগ করুন
]), async (req, res) => {
  try {
    // file ফিল্ড req.files-এ, বাকি ফিল্ড req.body-তে পাবেন
    const studentData = {
      ...req.body,
      photo: req.files?.photo ? req.files.photo[0].originalname : null,
      gdCopy: req.files?.gdCopy ? req.files.gdCopy[0].originalname : null,
      oldIdImage: req.files?.oldIdImage ? req.files.oldIdImage[0].originalname : null,
    };
    const student = await Student.create(studentData);
    res.status(201).json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approved applications দেখানোর জন্য route
app.get('/api/applications', async (req, res) => {
  try {
    const applications = await Application.find({});
    res.json({ applications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
const startServer = async () => {
  await connectDB();
  await createInitialAdmin();
  app.listen(process.env.PORT, () => {
    console.log(`🚀 Server running on port ${process.env.PORT}`);
  });
};

startServer();