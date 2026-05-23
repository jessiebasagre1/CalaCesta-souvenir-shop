const nodemailer = require('nodemailer');

console.log('mailer.js loaded, EMAIL_USER:', process.env.EMAIL_USER);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

console.log('transporter type:', typeof transporter.sendMail);

module.exports = transporter;