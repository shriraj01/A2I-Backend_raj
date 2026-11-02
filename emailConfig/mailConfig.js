const nodemailer = require("nodemailer");
const { pool1 } = require("../dbConfig/connect");
require("dotenv").config();

let transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tks: {
      ciphers: "SSLv3",
    },
  });

  if (process.env.NODE_ENV !== "test") {
    transporter.verify().then(console.log).catch(console.error);
  }

  const errorNotification = (error) => {
    transporter
      .sendMail({
        to: process.env.EMAIL_ERROR_NOTIFICATION,
        from: process.env.EMAIL_FROM,
        subject: "Error! Server Restarted.",
        html: `${error}`,
      })
      .then(() => {
        console.log("Mail sent Successfully");
      })
      .catch((e) => {
        console.log("err is", e);
      });
  };


  const innovationsUpdatemail = (emp_email, empName) => {
    // Return if transporter is not configured
    if (!transporter) {
      console.error("Mail transporter is not configured.");
      return;
    }
  
    transporter
      .sendMail({
        to: emp_email,
        cc: process.env.EMAIL_A2I_PANEL,
        from: process.env.EMAIL_FROM,
        subject: "Your Innovation Idea is Registered",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <p>Hello <span style="font-weight: bold;">${empName}</span>,</p>
    
            <p>
              Thank you for submitting your creative idea. Your idea has been successfully recorded.
            </p>
    
            <p>
              You will hear back from us regarding the next steps. Keep Innovating.
            </p>
    
            <p>Best regards,<br>A2I Team</p>
             <div style="margin-bottom: 10px;">
              <img src="cid:ahanaLogo" alt="Ahana Logo" style="width: 100px;">
            </div>
            <p style="color: #555;">
              <b>Note</b>: <em>This is a system-generated email. Please do not reply to this email.
            </p>
          </div>
        `,
        attachments: [
          {
            filename: 'ahanaLogo02.png', // Provide the logo file name
            path: "../A2I_Backend/images/ahanaLogo02.png", // Update this path with the actual logo file path on your server
            cid: 'ahanaLogo', // Same CID used in the img src attribute
          },
        ],
      })
      .then(() => {
        console.log("Mail sent successfully");
      })
      .catch((error) => {
        console.error("Error sending mail:", error);
      });
  };
  
  const automationCreationMail = (emp_email, empName) => {
    // Return if transporter is not configured
    if (!transporter) {
      console.error("Mail transporter is not configured.");
      return;
    }

    transporter
      .sendMail({
        to: emp_email,
        cc: process.env.EMAIL_A2I_PANEL,
        from: process.env.EMAIL_FROM,
        subject: "Automation Request Acknowledged",
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <p>Hello <span style="font-weight: bold;">${empName}</span>,</p>
      
              <p>
                We've received your request through the Request Automation/AI Module. Thank you for helping us identify opportunities to improve efficiency and reduce manual effort. 
                You will hear back from us regarding the next steps.
              </p>
      
              <p>Best regards,<br>A2I Team</p>
              <div style="margin-bottom: 10px;">
                <img src="cid:ahanaLogo" alt="Ahana Logo" style="width: 100px;">
              </div>
              <p style="color: #555;">
                <b>Note</b>: <em>This is a system-generated email. Please do not reply to this email.
              </p>
            </div>
          `,
        attachments: [
          {
            filename: 'ahanaLogo02.png', // Provide the logo file name
            path: "../A2I_Backend/images/ahanaLogo02.png", // Update this path with the actual logo file path on your server
            cid: 'ahanaLogo', // Same CID used in the img src attribute
          },
        ],
      })
      .then(() => {
        console.log("Mail sent successfully");
      })
      .catch((error) => {
        console.error("Error sending mail:", error);
      });
  };

  const enthusiastCreationMail = (emp_email, empName) => {
    // Return if transporter is not configured
    if (!transporter) {
      console.error("Mail transporter is not configured.");
      return;
    }

    transporter
      .sendMail({
        to: emp_email,
        cc: process.env.EMAIL_A2I_PANEL,
        from: process.env.EMAIL_FROM,
        subject: "AI Enthusiast Request Received!",
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <p>Hello <span style="font-weight: bold;">${empName}</span>,</p>
      
              <p>
                Thank you for your interest! Your registration request as an AI Enthusiast has been successfully recorded.
                We look forward to collaborating with you to drive our AI culture forward! 
              </p>
      
              <p>
                You will hear back from us regarding the next steps.
              </p>
      
              <p>Best regards,<br>A2I Team</p>
              <div style="margin-bottom: 10px;">
                <img src="cid:ahanaLogo" alt="Ahana Logo" style="width: 100px;">
              </div>
              <p style="color: #555;">
                <b>Note</b>: <em>This is a system-generated email. Please do not reply to this email.
              </p>
            </div>
          `,
        attachments: [
          {
            filename: 'ahanaLogo02.png', // Provide the logo file name
            path: "../A2I_Backend/images/ahanaLogo02.png", // Update this path with the actual logo file path on your server
            cid: 'ahanaLogo', // Same CID used in the img src attribute
          },
        ],
      })
      .then(() => {
        console.log("Mail sent successfully");
      })
      .catch((error) => {
        console.error("Error sending mail:", error);
      });
  };

const supportCreationMail = (emp_email, empName) => {
  // Return if transporter is not configured
  if (!transporter) {
    console.error("Mail transporter is not configured.");
    return;
  }

  transporter
    .sendMail({
      to: emp_email,
      cc: process.env.EMAIL_A2I_PANEL,
      from: process.env.EMAIL_FROM,
      subject: "Support Request Acknowledged",
      html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <p>Hello <span style="font-weight: bold;">${empName}</span>,</p>
      
              <p>
                We've received your request through the Request Automation/AI Module. Thank you for helping us identify opportunities to improve efficiency and reduce manual effort. 
                You will hear back from us regarding the next steps.
              </p>
      
              <p>Best regards,<br>A2I Team</p>
              <div style="margin-bottom: 10px;">
                <img src="cid:ahanaLogo" alt="Ahana Logo" style="width: 100px;">
              </div>
              <p style="color: #555;">
                <b>Note</b>: <em>This is a system-generated email. Please do not reply to this email.
              </p>
            </div>
          `,
      attachments: [
        {
          filename: 'ahanaLogo02.png', // Provide the logo file name
          path: "../A2I_Backend/images/ahanaLogo02.png", // Update this path with the actual logo file path on your server
          cid: 'ahanaLogo', // Same CID used in the img src attribute
        },
      ],
    })
    .then(() => {
      console.log("Mail sent successfully");
    })
    .catch((error) => {
      console.error("Error sending mail:", error);
    });
};

const innovationTransferMail = (emp_email, empName, from, to) => {

  if (!transporter) {
    console.error("Mail transporter is not configured.");
    return;
  }

  const capitalize = (text) =>
    text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

  let subject = "";
  let fieldsHtml = "";
  let navigationHtml = "";

  // ---------- FROM INNOVATION ----------
  if (from === "innovation") {

    subject = "Request Transferred from Innovation";

    fieldsHtml = `
      <p>Please update the following details:</p>
      <ul>
        <li><b>This request is for</b></li>
        <li><b>Current manual effort per month (in hours)</b></li>
        <li><b>Approximate Manual cost currently (Per Month)</b></li>
      </ul>
    `;

    if (to === "automation") {
      navigationHtml = `
        <p><b>Steps to update:</b></p>
        <p>
          Open <b>My Requests</b> → Click on the <b>Edit</b> button → 
          Fill the required details and <b>Submit</b>.
        </p>
      `;
    }

    if (to === "support") {
      navigationHtml = `
        <p><b>Steps to update:</b></p>
        <p>
          Open <b>My Request</b> → Click on the <b>Edit</b> button → 
          Fill the required details and <b>Submit</b>.
        </p>
      `;
    }
  }

  // ---------- TO INNOVATION ----------
  if (to === "innovation") {

    subject = "Request Transferred to Innovation";

    fieldsHtml = `
      <p>Please provide the following details:</p>
      <ul>
        <li><b>Who are the customers or target audience?</b></li>
        <li><b>Has this idea been tried before (inside or outside the company)?</b></li>
        <li><b>Would you like to be part of the implementation team? (If this idea is approved)</b></li>
      </ul>
    `;

    navigationHtml = `
      <p><b>Steps to update:</b></p>
      <p>
        Open <b>My Innovation</b> → Click on the <b>Edit</b> button → 
        Provide the required details and <b>Submit</b>.
      </p>
    `;
  }

  transporter
    .sendMail({
      to: emp_email,
      cc: process.env.EMAIL_A2I_PANEL,
      from: process.env.EMAIL_FROM,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          
          <p>Hello <b>${empName}</b>,</p>

          <p>
            Your request has been transferred 
            <b>from ${capitalize(from)}</b> to 
            <b>${capitalize(to)}</b> in the A2I system.
          </p>

          ${fieldsHtml}

          ${navigationHtml}

          <p>Please login to the system and update the required information.</p>

          <p>Best regards,<br><b>A2I Team</b></p>

          <div style="margin-bottom: 10px;">
            <img src="cid:ahanaLogo" alt="Ahana Logo" style="width: 100px;">
          </div>

          <p style="color: #555;">
            <b>Note:</b> <em>This is a system-generated email. Please do not reply to this email.</em>
          </p>

        </div>
      `,
      attachments: [
        {
          filename: "ahanaLogo02.png",
          path: "../A2I_Backend/images/ahanaLogo02.png",
          cid: "ahanaLogo",
        },
      ],
    })
    .then(() => {
      console.log("Transfer mail sent successfully");
    })
    .catch((error) => {
      console.error("Error sending transfer mail:", error);
    });
};
  
  module.exports = {
    errorNotification,
    innovationsUpdatemail,
    automationCreationMail,
    enthusiastCreationMail,
    supportCreationMail,
    innovationTransferMail
  }