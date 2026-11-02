const { pool1 } = require("../dbConfig/connect");

const insertInnovationHistory = (innovationId, data, uploadPath, version = 1) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO innovationtask_history(
        Innovation_id, version, emp_id, emp_name, idea_name, idea_description,
        market, target_audience, tried_before, reference_links, upload_path,
        join_implementation_team, created_by, group_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      innovationId,
      version,
      data.emp_id,
      data.emp_name,
      data.idea_name,
      data.idea_description,
      data.market,
      data.target_audience,
      data.tried_before,
      data.reference_links || null,
      uploadPath ? uploadPath.originalname : null,
      data.join_implementation_team,
      data.emp_id,
      data.groupName,
    ];

    pool1.query(query, values, (err) => {
      if (err) {
        console.error("❌ History insert error:", err);
        return reject(err);
      }
      resolve();
    });
  });
};

const insertUpdateInnovationHistory = (innovationId, data, uploadPath, version = 1) => {
  return new Promise((resolve, reject) => {
    // If no new file, fetch the current upload_path from the main table
    const getUploadPathQuery = `
      SELECT upload_path FROM ahana_innovation_lab.innovationtask_details
      WHERE Innovation_id = ?
    `;

    pool1.query(getUploadPathQuery, [innovationId], (fetchErr, results) => {
      if (fetchErr) {
        console.error("❌ Error fetching old upload_path:", fetchErr);
        return reject(fetchErr);
      }

      const existingUploadPath = results?.[0]?.upload_path || null;

      // ✅ Correct handling: new file (string) or existing file from main table
      const finalUploadPath = uploadPath || existingUploadPath;

      const insertQuery = `
        INSERT INTO ahana_innovation_lab.innovationtask_history (
          Innovation_id, version, emp_id, emp_name, idea_name, idea_description,
          market, target_audience, tried_before, reference_links, upload_path,
          join_implementation_team, created_by, group_name
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        innovationId,
        version,
        data.emp_id,
        data.emp_name,
        data.idea_name,
        data.idea_description,
        data.market,
        data.target_audience,
        data.tried_before,
        data.reference_links || null,
        finalUploadPath,
        data.join_implementation_team,
        data.emp_id,
        data.groupName,
      ];

      pool1.query(insertQuery, values, (err) => {
        if (err) {
          console.error("❌ History insert error:", err);
          return reject(err);
        }

        resolve();
      });
    });
  });
};

const insertAutomationHistory = (requestId, data, processChartFile, version = 1) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO automation_requests_history (
        request_id, version, emp_id, emp_name, process_name, process_description,
        request_for, manual_effort_hours, manual_expenses, process_chart_file,
        previous_file, status, created_by, groupName
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      requestId,
      version,
      data.emp_id,
      data.emp_name,
      data.process_name,
      data.process_description,
      data.request_for,
      parseInt(data.manual_effort_hours) || 0,
      parseFloat(data.manual_expenses) || 0,
      processChartFile ? processChartFile.originalname : null, // current file
      null, // no previous file during first insert
      data.status,
      data.created_by,
      data.groupName,
    ];

    pool1.query(query, values, (err) => {
      if (err) {
        console.error("❌ Automation History Insert Error:", err);
        return reject(err);
      }
      resolve();
    });
  });
};


const insertUpdateAutomationHistory = (requestId, data, processChartFile, version = 1) => {
  return new Promise((resolve, reject) => {
    const getFileQuery = `
      SELECT process_chart_file 
      FROM automation_requests
      WHERE request_id = ?
    `;

    pool1.query(getFileQuery, [requestId], (fetchErr, results) => {
      if (fetchErr) {
        console.error("❌ Error fetching current process_chart_file:", fetchErr);
        return reject(fetchErr);
      }

      const existingFile = results?.[0]?.process_chart_file || null;

      // Determine current and previous files
      const currentFile = processChartFile ? processChartFile.originalname : existingFile;
      const previousFile = processChartFile ? existingFile : null;

      const insertQuery = `
        INSERT INTO automation_requests_history (
          request_id, version, emp_id, emp_name, process_name, process_description,
          request_for, manual_effort_hours, manual_expenses, process_chart_file,
          previous_file, status, created_by, groupName
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        requestId,
        version,
        data.emp_id,
        data.emp_name,
        data.process_name,
        data.process_description,
        data.request_for,
        parseInt(data.manual_effort_hours) || 0,
        parseFloat(data.manual_expenses) || 0,
        currentFile,
        previousFile,
        data.status,
        data.created_by,
        data.groupName
      ];

      pool1.query(insertQuery, values, (err) => {
        if (err) {
          console.error("❌ Automation History Insert Error:", err);
          return reject(err);
        }

        resolve();
      });
    });
  });
};


const insertEnthusiastHistory = (enthusiastId, data, certificateFile, version = 1) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO ai_enthusiasts_history (
        enthusiasts_id, version, emp_id, emp_name, skills_profile, ai_tools_known,
        automation_experience, automation_description, time_available_daily,
        expertise_level, status, created_by, groupName, remarks, haveCertificate,
        certificateFile, previous_certificateFile
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      enthusiastId,
      version,
      data.emp_id,
      data.emp_name,
      data.skills_profile,
      data.ai_tools_known || null,
      data.automation_experience,
      data.automation_description || null,
      data.time_available_daily,
      data.expertise_level,
      data.status,
      data.created_by,
      data.groupName || null,
      data.remarks || null,
      data.haveCertificate || null,
      certificateFile ? certificateFile.originalname : null,
      null,
    ];

    pool1.query(query, values, (err) => {
      if (err) {
        console.error("❌ Enthusiast History Insert Error:", err);
        return reject(err);
      }
      resolve();
    });
  });
};


const insertUpdateEnthusiastHistory = (enthusiasts_id, data, certificateFile, version = 1) => {
  return new Promise((resolve, reject) => {
    const getFileQuery = `
      SELECT certificateFile 
      FROM ahana_innovation_lab.ai_enthusiasts
      WHERE enthusiasts_id = ?
    `;

    pool1.query(getFileQuery, [enthusiasts_id], (fetchErr, results) => {
      if (fetchErr) {
        console.error("❌ Error fetching current certificateFile:", fetchErr);
        return reject(fetchErr);
      }

      const existingFile = results?.[0]?.certificateFile || null;

      // Determine current and previous files
      const currentFile = certificateFile ? certificateFile.originalname : existingFile;
      const previousFile = certificateFile ? existingFile : null;

      const insertQuery = `
        INSERT INTO ahana_innovation_lab.ai_enthusiasts_history (
          enthusiasts_id, emp_id, emp_name, version, skills_profile, ai_tools_known, automation_experience, automation_description,
          time_available_daily, expertise_level, haveCertificate, certificateFile, previous_certificateFile, created_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      const values = [
        enthusiasts_id,
        data.emp_id,
        data.emp_name,
        version,
        data.skills_profile,
        data.ai_tools_known,
        data.automation_experience,
        data.automation_description,
        data.time_available_daily,
        data.expertise_level,
        data.haveCertificate || 0,
        currentFile,
        previousFile,
        data.created_by
      ];

      pool1.query(insertQuery, values, (err) => {
        if (err) {
          console.error("❌ Enthusiast History Insert Error:", err);
          return reject(err);
        }

        resolve();
      });
    });
  });
};

const insertSupportHistory = (supportRequestId, data, processChartFile, version = 1) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO support_requests_history (
        support_request_id, version, emp_id, emp_name, process_name, process_description,
        request_for, manual_effort_hours, manual_expenses, process_chart_file,
        previous_file, status, created_by, groupName
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      supportRequestId,
      version,
      data.emp_id,
      data.emp_name,
      data.process_name,
      data.process_description,
      data.request_for,
      parseInt(data.manual_effort_hours) || 0,
      parseFloat(data.manual_expenses) || 0,
      processChartFile ? processChartFile.originalname : null, // current file
      null, // no previous file during first insert
      data.status || "Under Review",
      data.created_by,
      data.groupName
    ];

    pool1.query(query, values, (err) => {
      if (err) {
        console.error("❌ Support History Insert Error:", err);
        return reject(err);
      }
      resolve();
    });
  });
};

const insertUpdateSupportHistory = (supportRequestId, data, processChartFile, version = 1) => {
  return new Promise((resolve, reject) => {
    const getFileQuery = `
      SELECT process_chart_file 
      FROM support_requests
      WHERE support_request_id = ?
    `;

    pool1.query(getFileQuery, [supportRequestId], (fetchErr, results) => {
      if (fetchErr) {
        console.error("❌ Error fetching current process_chart_file:", fetchErr);
        return reject(fetchErr);
      }

      const existingFile = results?.[0]?.process_chart_file || null;

      // Determine current and previous files
      const currentFile = processChartFile ? processChartFile : existingFile;
      const previousFile = processChartFile ? existingFile : null;

      const insertQuery = `
        INSERT INTO support_requests_history (
          support_request_id, version, emp_id, emp_name, process_name, process_description,
          request_for, manual_effort_hours, manual_expenses, process_chart_file,
          previous_file, status, created_by, groupName
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        supportRequestId,
        version,
        data.emp_id,
        data.emp_name,
        data.process_name,
        data.process_description,
        data.request_for,
        parseInt(data.manual_effort_hours) || 0,
        parseFloat(data.manual_expenses) || 0,
        currentFile,
        previousFile,
        data.status || "Under Review",
        data.created_by,
        data.groupName
      ];

      pool1.query(insertQuery, values, (err) => {
        if (err) {
          console.error("❌ Support History Insert Error:", err);
          return reject(err);
        }

        resolve();
      });
    });
  });
};

module.exports = {
  insertInnovationHistory,
  insertUpdateInnovationHistory,
  insertAutomationHistory,
  insertUpdateAutomationHistory,
  insertEnthusiastHistory,
  insertUpdateEnthusiastHistory,
  insertSupportHistory,
  insertUpdateSupportHistory
};
