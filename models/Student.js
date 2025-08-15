const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
    studentId: String,
    cardType: String,
    firstName: String,
    lastName: String,
    email: String,
    program: String,
    requestType: String,
    photo: String, // URL or Base64 if you store images
    gdCopy: String,
    oldIdImage: String,
}, { timestamps: true });

module.exports = mongoose.model("Student", studentSchema);
