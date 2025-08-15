const express = require("express");
const multer = require("multer");
const Student = require("../models/Student");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
    "/",
    upload.fields([
        { name: "photo", maxCount: 1 },
        { name: "gdCopy", maxCount: 1 },
        { name: "oldIdImage", maxCount: 1 }
    ]),
    async (req, res) => {
        try {
            const data = {
                ...req.body,
                photo: req.files.photo ? req.files.photo[0].originalname : null,
                gdCopy: req.files.gdCopy ? req.files.gdCopy[0].originalname : null,
                oldIdImage: req.files.oldIdImage ? req.files.oldIdImage[0].originalname : null
            };

            const student = new Student(data);
            await student.save();

            res.status(201).json({ message: "Student request saved successfully", student });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server error" });
        }
    }
);

module.exports = router;
