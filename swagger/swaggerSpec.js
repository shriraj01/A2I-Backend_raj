// swagger/swaggerSpec.js

module.exports = {
  openapi: "3.0.0",
  info: {
    title: "A2I API Documentation",
    version: "1.0.0",
  },
  servers: [
    {
      url: process.env.SWAGGER_URL,
    },
  ],
  tags: [
    { name: "Authentication", description: "SSO Login & Session Validation" },
    { name: "Innovation Lab", description: "Innovation Idea creation, approval workflow, project management & team tracking" },
    { name: "Automation Requests", description: "Automation request lifecycle, approval, assignment & documents" },
    { name: "AI Enthusiasts", description: "AI Enthusiasts registration, evaluation & approvals" },
    { name: "Support Requests", description: "Support requests workflow, assignment, execution & documents" },
    { name: "Messages & Notes", description: "Chat, notes & communication across requests" },
    { name: "Comments & Reactions", description: "Reactions, discussions & replies on requests" },
    { name: "Dashboard", description: "Analytics, request counts & high-level reporting" },
    { name: "User Management", description: "Roles, permissions & employee listings" },
    { name: "Request Transfer", description: "Inter-category request transfer (e.g. Innovation to Automation)" },
    { name: "System", description: "Health & root checks" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Pass your MyAhana SSO Access Token. Swagger UI automatically sends 'Authorization: Bearer <token>'",
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
  paths: {
    // -------------------------------------------------------------
    // SYSTEM / HEALTH
    // -------------------------------------------------------------
    "/health": {
      get: {
        tags: ["System"],
        summary: "Service health check",
        security: [],
        responses: {
          200: { description: "Service is healthy" },
        },
      },
    },
    "/": {
      get: {
        tags: ["System"],
        summary: "Root endpoint",
        security: [],
        responses: {
          200: { description: "Root ping response" },
        },
      },
    },

    // -------------------------------------------------------------
    // AUTHENTICATION
    // -------------------------------------------------------------
    "/api/ahanainnovationLogin": {
      post: {
        tags: ["Authentication"],
        summary: "MyAhana SSO Login / Verify User",
        description: "Validates the Bearer token against MyAhana SSO and loads the user profile with RBAC role from the A2I database.",
        responses: {
          200: {
            description: "User profile and role loaded successfully",
            content: {
              "application/json": {
                example: {
                  success: true,
                  message: "Login successful",
                  user: {
                    emp_id: "EMP123",
                    name: "John Doe",
                    email: "john.doe@ahanait.com",
                    role: "Admin"
                  }
                }
              }
            }
          },
          401: { description: "Unauthorized or invalid/expired token" },
        },
      },
    },
    "/api/validateSession": {
      get: {
        tags: ["Authentication"],
        summary: "Validate Active Session with MyAhana",
        description: "Checks if the provided Bearer token is still actively authenticated with MyAhana SSO.",
        responses: {
          200: {
            description: "Session is valid",
            content: {
              "application/json": {
                example: {
                  valid: true,
                  user: {
                    emp_id: "EMP123",
                    email: "john.doe@ahanait.com",
                    full_name: "John Doe"
                  }
                }
              }
            }
          },
          401: { description: "Session expired or invalid" }
        }
      }
    },
    "/api/validate": {
      get: {
        tags: ["Authentication"],
        summary: "Validate Token",
        responses: {
          200: { description: "Token is valid" },
          401: { description: "Invalid token" }
        }
      }
    },

    // -------------------------------------------------------------
    // INNOVATION LAB
    // -------------------------------------------------------------
    "/api/CreateInnovation": {
      post: {
        tags: ["Innovation Lab"],
        summary: "Submit a new Innovation Idea",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                title: "AI-Powered Documentation",
                description: "Automated extraction and documentation system using LLMs",
                emp_id: "EMP123",
                emp_name: "John Doe",
                department: "Engineering"
              }
            }
          }
        },
        responses: {
          200: { description: "Innovation Idea created successfully" }
        }
      }
    },
    "/api/viewallInnovation": {
      get: {
        tags: ["Innovation Lab"],
        summary: "Get all Innovation Ideas",
        responses: {
          200: { description: "List of all innovation ideas" }
        }
      }
    },
    "/api/viewuserInnovation/{emp_id}": {
      get: {
        tags: ["Innovation Lab"],
        summary: "Get Innovation Ideas by employee ID",
        parameters: [
          { name: "emp_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          200: { description: "List of employee's innovations" }
        }
      }
    },
    "/api/viewapprovedInnovations": {
      get: {
        tags: ["Innovation Lab"],
        summary: "Get all approved Innovation Ideas",
        responses: {
          200: { description: "List of approved innovations" }
        }
      }
    },
    "/api/getinnovationCount": {
      get: {
        tags: ["Innovation Lab"],
        summary: "Get total Innovation Ideas count by status",
        responses: {
          200: { description: "Innovation counts" }
        }
      }
    },
    "/api/getallEmployess": {
      get: {
        tags: ["Innovation Lab"],
        summary: "Get all employees from HRMS",
        responses: {
          200: { description: "Employee list" }
        }
      }
    },
    "/api/editInnovation": {
      post: {
        tags: ["Innovation Lab"],
        summary: "Edit an existing Innovation Idea",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                Innovation_id: 1,
                title: "Updated Title",
                description: "Updated Description"
              }
            }
          }
        },
        responses: { 200: { description: "Innovation updated" } }
      }
    },
    "/api/accpetInnovation/{Innovation_id}": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Accept Innovation Idea",
        parameters: [
          { name: "Innovation_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Innovation accepted" } }
      }
    },
    "/api/declinInnovation/{Innovation_id}": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Decline Innovation Idea",
        parameters: [
          { name: "Innovation_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Innovation declined" } }
      }
    },
    "/api/onholdInnovation/{Innovation_id}": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Put Innovation Idea on hold",
        parameters: [
          { name: "Innovation_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Innovation put on hold" } }
      }
    },
    "/api/inProgressInnovation/{Innovation_id}": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Mark Innovation Idea in-progress",
        parameters: [
          { name: "Innovation_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Innovation moved to in-progress" } }
      }
    },
    "/api/completedInnovation/{Innovation_id}": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Mark Innovation Idea completed",
        parameters: [
          { name: "Innovation_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Innovation marked completed" } }
      }
    },
    "/api/updateInnovationStatus/{Innovation_id}": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Update Innovation status directly",
        parameters: [
          { name: "Innovation_id", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { status: "Approved" }
            }
          }
        },
        responses: { 200: { description: "Status updated" } }
      }
    },
    "/api/addInnovationRemark": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Add a remark to an Innovation Idea",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                Innovation_id: 1,
                remark: "Reviewed and requested additional POC details"
              }
            }
          }
        },
        responses: { 200: { description: "Remark added" } }
      }
    },
    "/api/getInnovationHistory": {
      get: {
        tags: ["Innovation Lab"],
        summary: "Get audit history for an Innovation Idea",
        parameters: [
          { name: "Innovation_id", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Innovation history logs" } }
      }
    },
    "/api/deleteInnovation": {
      post: {
        tags: ["Innovation Lab"],
        summary: "Delete an Innovation Idea",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { Innovation_id: 1 }
            }
          }
        },
        responses: { 200: { description: "Innovation deleted" } }
      }
    },
    "/api/assignInnovationProject": {
      post: {
        tags: ["Innovation Lab"],
        summary: "Assign Innovation Project to developer/team",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                Innovation_id: 1,
                assigned_to_emp_id: "EMP123",
                assigned_to_emp_name: "John Doe"
              }
            }
          }
        },
        responses: { 200: { description: "Project assigned" } }
      }
    },
    "/api/getMyInnovationProjects/{emp_id}": {
      get: {
        tags: ["Innovation Lab"],
        summary: "Get assigned Innovation Projects for an employee",
        parameters: [
          { name: "emp_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Assigned innovation projects list" } }
      }
    },
    "/api/manageInnovationProjectTeam": {
      post: {
        tags: ["Innovation Lab"],
        summary: "Add team member to an Innovation Project",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                Innovation_id: 1,
                emp_id: "EMP456",
                emp_name: "Jane Smith",
                role: "Contributor"
              }
            }
          }
        },
        responses: { 200: { description: "Team member added" } }
      }
    },
    "/api/getAllMyInnovationProjectTeams/{emp_id}": {
      get: {
        tags: ["Innovation Lab"],
        summary: "Get all team assignments for an employee in Innovation projects",
        parameters: [
          { name: "emp_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "List of project teams" } }
      }
    },
    "/api/getInnovationProjectTeamDetails/{Innovation_id}": {
      get: {
        tags: ["Innovation Lab"],
        summary: "Get team members for a specific Innovation Project",
        parameters: [
          { name: "Innovation_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Project team members" } }
      }
    },
    "/api/editInnovationProjectTeam/{team_id}": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Update Innovation Project team member details",
        parameters: [
          { name: "team_id", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { role: "Lead" }
            }
          }
        },
        responses: { 200: { description: "Team member updated" } }
      }
    },
    "/api/deleteInnovationProjectTeam/{team_id}": {
      delete: {
        tags: ["Innovation Lab"],
        summary: "Remove member from Innovation Project team",
        parameters: [
          { name: "team_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Team member removed" } }
      }
    },
    "/api/approveInnovationProject": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Approve Innovation Project for development",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { Innovation_id: 1, remarks: "Approved for Q3" }
            }
          }
        },
        responses: { 200: { description: "Project approved" } }
      }
    },
    "/api/startInnovationProject/{Innovation_id}": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Start execution of an Innovation Project",
        parameters: [
          { name: "Innovation_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Project started" } }
      }
    },
    "/api/endInnovationProject/{Innovation_id}": {
      put: {
        tags: ["Innovation Lab"],
        summary: "End/complete an Innovation Project",
        parameters: [
          { name: "Innovation_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Project ended" } }
      }
    },
    "/api/getInnovationProjectDetails/{Innovation_id}": {
      get: {
        tags: ["Innovation Lab"],
        summary: "Get full details of an Innovation Project",
        parameters: [
          { name: "Innovation_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Project details" } }
      }
    },
    "/api/setInnovationProjectOwnerAndCode": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Set project owner and project code",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                Innovation_id: 1,
                project_code: "A2I-INN-001",
                project_owner: "EMP123"
              }
            }
          }
        },
        responses: { 200: { description: "Project code and owner assigned" } }
      }
    },
    "/api/mergeInnovationIdea": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Merge an Innovation Idea into another",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                source_id: 2,
                target_id: 1,
                remarks: "Merged duplicate idea"
              }
            }
          }
        },
        responses: { 200: { description: "Innovation idea merged" } }
      }
    },
    "/api/uploadInnovationProjectDocument": {
      post: {
        tags: ["Innovation Lab"],
        summary: "Upload project document or attach resource link",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  ipa_id: { type: "string", description: "Innovation Project Assigned ID" },
                  link: { type: "string", description: "Optional URL/link" },
                  files: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                    description: "Files (PDF, DOC, XLS, PNG, JPG up to 5MB)"
                  }
                },
                required: ["ipa_id"]
              }
            }
          }
        },
        responses: { 200: { description: "Document uploaded successfully" } }
      }
    },
    "/api/deleteInnovationProjectDocument": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Delete an uploaded document from an Innovation Project",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                ipa_id: "1",
                file_name: "specification.pdf",
                link_only: false
              }
            }
          }
        },
        responses: { 200: { description: "Document deleted" } }
      }
    },
    "/api/updateProgressPercentage": {
      put: {
        tags: ["Innovation Lab"],
        summary: "Update Innovation Project progress percentage",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                ipa_id: 1,
                progress_percentage: 75
              }
            }
          }
        },
        responses: { 200: { description: "Progress updated" } }
      }
    },

    // -------------------------------------------------------------
    // AUTOMATION REQUESTS
    // -------------------------------------------------------------
    "/api/createAutomationReq": {
      post: {
        tags: ["Automation Requests"],
        summary: "Submit a new Automation Request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                title: "Invoice Processing Automation",
                description: "Automate invoice extraction from vendor emails",
                emp_id: "EMP123",
                emp_name: "John Doe",
                department: "Finance"
              }
            }
          }
        },
        responses: { 200: { description: "Automation request created" } }
      }
    },
    "/api/viewallAutomationReq": {
      get: {
        tags: ["Automation Requests"],
        summary: "Get all Automation Requests",
        responses: { 200: { description: "List of automation requests" } }
      }
    },
    "/api/viewuserAutomationReq/{emp_id}": {
      get: {
        tags: ["Automation Requests"],
        summary: "Get Automation Requests submitted by an employee",
        parameters: [
          { name: "emp_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Employee automation requests" } }
      }
    },
    "/api/viewApprovedAutomationReq": {
      get: {
        tags: ["Automation Requests"],
        summary: "Get all approved Automation Requests",
        responses: { 200: { description: "Approved automation requests" } }
      }
    },
    "/api/getAutomationReqCount": {
      get: {
        tags: ["Automation Requests"],
        summary: "Get counts of Automation Requests by status",
        responses: { 200: { description: "Automation counts" } }
      }
    },
    "/api/editAutomationReq": {
      post: {
        tags: ["Automation Requests"],
        summary: "Edit Automation Request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                request_id: 1,
                title: "Updated Title",
                description: "Updated Description"
              }
            }
          }
        },
        responses: { 200: { description: "Request updated" } }
      }
    },
    "/api/acceptAutomationReq/{request_id}": {
      put: {
        tags: ["Automation Requests"],
        summary: "Accept Automation Request",
        parameters: [
          { name: "request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Request accepted" } }
      }
    },
    "/api/rejectAutomationReq/{request_id}": {
      put: {
        tags: ["Automation Requests"],
        summary: "Reject Automation Request",
        parameters: [
          { name: "request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Request rejected" } }
      }
    },
    "/api/onholdAutomationReq/{request_id}": {
      put: {
        tags: ["Automation Requests"],
        summary: "Put Automation Request on hold",
        parameters: [
          { name: "request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Request put on hold" } }
      }
    },
    "/api/inProgressAutomationReq/{request_id}": {
      put: {
        tags: ["Automation Requests"],
        summary: "Move Automation Request to in-progress",
        parameters: [
          { name: "request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Request in-progress" } }
      }
    },
    "/api/completedAutomationReq/{request_id}": {
      put: {
        tags: ["Automation Requests"],
        summary: "Mark Automation Request completed",
        parameters: [
          { name: "request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Request completed" } }
      }
    },
    "/api/updateAutomationStatus/{request_id}": {
      put: {
        tags: ["Automation Requests"],
        summary: "Update status of an Automation Request directly",
        parameters: [
          { name: "request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { status: "Approved" }
            }
          }
        },
        responses: { 200: { description: "Status updated" } }
      }
    },
    "/api/addAutomationRemark": {
      put: {
        tags: ["Automation Requests"],
        summary: "Add remark to Automation Request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                request_id: 1,
                remark: "Feasibility confirmed with RPA team"
              }
            }
          }
        },
        responses: { 200: { description: "Remark added" } }
      }
    },
    "/api/getAutomationHistory": {
      get: {
        tags: ["Automation Requests"],
        summary: "Get audit history for an Automation Request",
        parameters: [
          { name: "request_id", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Audit history logs" } }
      }
    },
    "/api/deleteAutomation": {
      post: {
        tags: ["Automation Requests"],
        summary: "Delete an Automation Request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { request_id: 1 }
            }
          }
        },
        responses: { 200: { description: "Request deleted" } }
      }
    },
    "/api/assignAutomationProject": {
      post: {
        tags: ["Automation Requests"],
        summary: "Assign Automation Request to a developer/owner",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                request_id: 1,
                assigned_to_emp_id: "EMP123",
                assigned_to_emp_name: "John Doe"
              }
            }
          }
        },
        responses: { 200: { description: "Project assigned" } }
      }
    },
    "/api/getMyAutomationProjects/{emp_id}": {
      get: {
        tags: ["Automation Requests"],
        summary: "Get assigned Automation Projects for an employee",
        parameters: [
          { name: "emp_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Assigned automation projects" } }
      }
    },
    "/api/manageAutomationProjectTeam": {
      post: {
        tags: ["Automation Requests"],
        summary: "Add team member to an Automation Project",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                request_id: 1,
                emp_id: "EMP456",
                emp_name: "Jane Smith",
                role: "Developer"
              }
            }
          }
        },
        responses: { 200: { description: "Team member added" } }
      }
    },
    "/api/getAllMyProjectTeams/{emp_id}": {
      get: {
        tags: ["Automation Requests"],
        summary: "Get all Automation Project teams for an employee",
        parameters: [
          { name: "emp_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "List of project teams" } }
      }
    },
    "/api/getProjectTeamDetails/{request_id}": {
      get: {
        tags: ["Automation Requests"],
        summary: "Get team members for an Automation Request",
        parameters: [
          { name: "request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Team members" } }
      }
    },
    "/api/editAutomationProjectTeam/{team_id}": {
      put: {
        tags: ["Automation Requests"],
        summary: "Edit Automation Project team member",
        parameters: [
          { name: "team_id", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { role: "Tech Lead" }
            }
          }
        },
        responses: { 200: { description: "Team member updated" } }
      }
    },
    "/api/deleteAutomationProjectTeam/{team_id}": {
      delete: {
        tags: ["Automation Requests"],
        summary: "Remove member from Automation Project team",
        parameters: [
          { name: "team_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Team member removed" } }
      }
    },
    "/api/approveAutomationProject": {
      put: {
        tags: ["Automation Requests"],
        summary: "Approve Automation Project for development",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { request_id: 1, remarks: "Approved" }
            }
          }
        },
        responses: { 200: { description: "Project approved" } }
      }
    },
    "/api/startProject/{request_id}": {
      put: {
        tags: ["Automation Requests"],
        summary: "Start execution of an Automation Project",
        parameters: [
          { name: "request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Project started" } }
      }
    },
    "/api/endProject/{request_id}": {
      put: {
        tags: ["Automation Requests"],
        summary: "End/complete an Automation Project",
        parameters: [
          { name: "request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Project ended" } }
      }
    },
    "/api/getProjectDetails/{request_id}": {
      get: {
        tags: ["Automation Requests"],
        summary: "Get full details of an Automation Project",
        parameters: [
          { name: "request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Project details" } }
      }
    },
    "/api/setProjectOwnerAndCode": {
      put: {
        tags: ["Automation Requests"],
        summary: "Set project owner and code for Automation Project",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                request_id: 1,
                project_code: "A2I-AUT-001",
                project_owner: "EMP123"
              }
            }
          }
        },
        responses: { 200: { description: "Project code and owner assigned" } }
      }
    },
    "/api/mergeProcess": {
      put: {
        tags: ["Automation Requests"],
        summary: "Merge an Automation Request into another",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                source_id: 2,
                target_id: 1,
                remarks: "Merged duplicate process"
              }
            }
          }
        },
        responses: { 200: { description: "Processes merged" } }
      }
    },
    "/api/uploadProjectDocument": {
      post: {
        tags: ["Automation Requests"],
        summary: "Upload document or link to an Automation Project",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  apa_id: { type: "string", description: "Automation Project Assigned ID" },
                  link: { type: "string", description: "Optional URL/link" },
                  files: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                    description: "Files (PDF, DOC, XLS, PNG, JPG up to 5MB)"
                  }
                },
                required: ["apa_id"]
              }
            }
          }
        },
        responses: { 200: { description: "Document uploaded" } }
      }
    },
    "/api/deleteProjectDocument": {
      put: {
        tags: ["Automation Requests"],
        summary: "Delete document or link from Automation Project",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                apa_id: "1",
                file_name: "doc.pdf",
                link_only: false
              }
            }
          }
        },
        responses: { 200: { description: "Document deleted" } }
      }
    },
    "/api/updateAutomationProgressPercentage": {
      put: {
        tags: ["Automation Requests"],
        summary: "Update Automation Project progress percentage",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                apa_id: 1,
                progress_percentage: 90
              }
            }
          }
        },
        responses: { 200: { description: "Progress updated" } }
      }
    },

    // -------------------------------------------------------------
    // AI ENTHUSIASTS
    // -------------------------------------------------------------
    "/api/createEnthusiasts": {
      post: {
        tags: ["AI Enthusiasts"],
        summary: "Register / submit as an AI Enthusiast",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                emp_id: "EMP123",
                emp_name: "John Doe",
                skills: "Python, PyTorch, LangChain",
                interest_areas: "Computer Vision, Generative AI",
                portfolio_link: "https://github.com/johndoe"
              }
            }
          }
        },
        responses: { 200: { description: "Application submitted" } }
      }
    },
    "/api/viewallEnthusiasts": {
      get: {
        tags: ["AI Enthusiasts"],
        summary: "Get all AI Enthusiasts registrations",
        responses: { 200: { description: "List of all enthusiasts" } }
      }
    },
    "/api/viewuserEnthusiasts/{emp_id}": {
      get: {
        tags: ["AI Enthusiasts"],
        summary: "Get AI Enthusiast profile for an employee",
        parameters: [
          { name: "emp_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Employee enthusiast profile" } }
      }
    },
    "/api/viewApprovedEnthusiasts": {
      get: {
        tags: ["AI Enthusiasts"],
        summary: "Get all approved AI Enthusiasts",
        responses: { 200: { description: "List of approved enthusiasts" } }
      }
    },
    "/api/getEnthusiastsCount": {
      get: {
        tags: ["AI Enthusiasts"],
        summary: "Get AI Enthusiasts count by status",
        responses: { 200: { description: "Enthusiasts counts" } }
      }
    },
    "/api/inReviewEnthusiasts/{enthusiasts_id}": {
      put: {
        tags: ["AI Enthusiasts"],
        summary: "Mark AI Enthusiast application as In-Review",
        parameters: [
          { name: "enthusiasts_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Application in review" } }
      }
    },
    "/api/acceptEnthusiasts/{enthusiasts_id}": {
      put: {
        tags: ["AI Enthusiasts"],
        summary: "Accept AI Enthusiast application",
        parameters: [
          { name: "enthusiasts_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Application accepted" } }
      }
    },
    "/api/rejectEnthusiasts/{enthusiasts_id}": {
      put: {
        tags: ["AI Enthusiasts"],
        summary: "Reject AI Enthusiast application",
        parameters: [
          { name: "enthusiasts_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Application rejected" } }
      }
    },
    "/api/onholdEnthusiasts/{enthusiasts_id}": {
      put: {
        tags: ["AI Enthusiasts"],
        summary: "Put AI Enthusiast application on hold",
        parameters: [
          { name: "enthusiasts_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Application placed on hold" } }
      }
    },
    "/api/editEnthusiast": {
      post: {
        tags: ["AI Enthusiasts"],
        summary: "Edit AI Enthusiast details",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                enthusiasts_id: 1,
                skills: "Python, TensorFlow, LLMs"
              }
            }
          }
        },
        responses: { 200: { description: "Enthusiast updated" } }
      }
    },
    "/api/addEnthusiastRemark": {
      put: {
        tags: ["AI Enthusiasts"],
        summary: "Add remark to an AI Enthusiast application",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                enthusiasts_id: 1,
                remark: "Candidate demonstrated good prompt engineering skills"
              }
            }
          }
        },
        responses: { 200: { description: "Remark added" } }
      }
    },
    "/api/getEnthusiastHistory": {
      get: {
        tags: ["AI Enthusiasts"],
        summary: "Get audit history for an AI Enthusiast",
        parameters: [
          { name: "enthusiasts_id", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Audit history logs" } }
      }
    },
    "/api/deleteEnthusiast": {
      post: {
        tags: ["AI Enthusiasts"],
        summary: "Delete an AI Enthusiast registration",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { enthusiasts_id: 1 }
            }
          }
        },
        responses: { 200: { description: "Registration deleted" } }
      }
    },

    // -------------------------------------------------------------
    // SUPPORT REQUESTS
    // -------------------------------------------------------------
    "/api/createSupportReq": {
      post: {
        tags: ["Support Requests"],
        summary: "Submit a new Support Request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                title: "Server Migration Support",
                description: "Need assistance with cloud database migration",
                emp_id: "EMP123",
                emp_name: "John Doe",
                priority: "High"
              }
            }
          }
        },
        responses: { 200: { description: "Support request created" } }
      }
    },
    "/api/viewallSupportReq": {
      get: {
        tags: ["Support Requests"],
        summary: "Get all Support Requests",
        responses: { 200: { description: "List of all support requests" } }
      }
    },
    "/api/viewuserSupportReq/{emp_id}": {
      get: {
        tags: ["Support Requests"],
        summary: "Get Support Requests submitted by an employee",
        parameters: [
          { name: "emp_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Employee support requests" } }
      }
    },
    "/api/editSupportReq": {
      post: {
        tags: ["Support Requests"],
        summary: "Edit Support Request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                support_request_id: 1,
                title: "Updated Title",
                description: "Updated Description"
              }
            }
          }
        },
        responses: { 200: { description: "Support request updated" } }
      }
    },
    "/api/acceptSupportReq/{support_request_id}": {
      put: {
        tags: ["Support Requests"],
        summary: "Accept Support Request",
        parameters: [
          { name: "support_request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Support request accepted" } }
      }
    },
    "/api/rejectSupportReq/{support_request_id}": {
      put: {
        tags: ["Support Requests"],
        summary: "Reject Support Request",
        parameters: [
          { name: "support_request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Support request rejected" } }
      }
    },
    "/api/onholdSupportReq/{support_request_id}": {
      put: {
        tags: ["Support Requests"],
        summary: "Put Support Request on hold",
        parameters: [
          { name: "support_request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Support request placed on hold" } }
      }
    },
    "/api/inProgressSupportReq/{support_request_id}": {
      put: {
        tags: ["Support Requests"],
        summary: "Move Support Request to in-progress",
        parameters: [
          { name: "support_request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Support request in-progress" } }
      }
    },
    "/api/completedSupportReq/{support_request_id}": {
      put: {
        tags: ["Support Requests"],
        summary: "Mark Support Request completed",
        parameters: [
          { name: "support_request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Support request completed" } }
      }
    },
    "/api/updateSupportStatus/{support_request_id}": {
      put: {
        tags: ["Support Requests"],
        summary: "Update Support Request status directly",
        parameters: [
          { name: "support_request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { status: "Resolved" }
            }
          }
        },
        responses: { 200: { description: "Status updated" } }
      }
    },
    "/api/addSupportRemark": {
      put: {
        tags: ["Support Requests"],
        summary: "Add remark to a Support Request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                support_request_id: 1,
                remark: "Configured target AWS database instance"
              }
            }
          }
        },
        responses: { 200: { description: "Remark added" } }
      }
    },
    "/api/getSupportHistory": {
      get: {
        tags: ["Support Requests"],
        summary: "Get audit history for a Support Request",
        parameters: [
          { name: "support_request_id", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Audit history logs" } }
      }
    },
    "/api/deleteSupport": {
      post: {
        tags: ["Support Requests"],
        summary: "Delete a Support Request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { support_request_id: 1 }
            }
          }
        },
        responses: { 200: { description: "Support request deleted" } }
      }
    },
    "/api/assignSupportProject": {
      post: {
        tags: ["Support Requests"],
        summary: "Assign Support Request to an engineer/lead",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                support_request_id: 1,
                assigned_to_emp_id: "EMP123",
                assigned_to_emp_name: "John Doe"
              }
            }
          }
        },
        responses: { 200: { description: "Support project assigned" } }
      }
    },
    "/api/getMySupportProjects/{emp_id}": {
      get: {
        tags: ["Support Requests"],
        summary: "Get assigned Support Projects for an employee",
        parameters: [
          { name: "emp_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Assigned support projects" } }
      }
    },
    "/api/manageSupportProjectTeam": {
      post: {
        tags: ["Support Requests"],
        summary: "Add team member to a Support Project",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                support_request_id: 1,
                emp_id: "EMP456",
                emp_name: "Jane Smith",
                role: "Support Engineer"
              }
            }
          }
        },
        responses: { 200: { description: "Team member added" } }
      }
    },
    "/api/getAllMySupportProjectTeams/{emp_id}": {
      get: {
        tags: ["Support Requests"],
        summary: "Get all Support Project team assignments for an employee",
        parameters: [
          { name: "emp_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "List of support teams" } }
      }
    },
    "/api/getSupportProjectTeamDetails/{support_request_id}": {
      get: {
        tags: ["Support Requests"],
        summary: "Get team members for a Support Project",
        parameters: [
          { name: "support_request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Team members" } }
      }
    },
    "/api/editSupportProjectTeam/{team_id}": {
      put: {
        tags: ["Support Requests"],
        summary: "Edit Support Project team member",
        parameters: [
          { name: "team_id", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { role: "Senior Engineer" }
            }
          }
        },
        responses: { 200: { description: "Team member updated" } }
      }
    },
    "/api/deleteSupportProjectTeam/{team_id}": {
      delete: {
        tags: ["Support Requests"],
        summary: "Remove member from Support Project team",
        parameters: [
          { name: "team_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Team member removed" } }
      }
    },
    "/api/approveSupportProject": {
      put: {
        tags: ["Support Requests"],
        summary: "Approve Support Project",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { support_request_id: 1, remarks: "Approved for execution" }
            }
          }
        },
        responses: { 200: { description: "Project approved" } }
      }
    },
    "/api/startSupportProject/{support_request_id}": {
      put: {
        tags: ["Support Requests"],
        summary: "Start Support Project",
        parameters: [
          { name: "support_request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Project started" } }
      }
    },
    "/api/endSupportProject/{support_request_id}": {
      put: {
        tags: ["Support Requests"],
        summary: "End Support Project",
        parameters: [
          { name: "support_request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Project ended" } }
      }
    },
    "/api/getSupportProjectDetails/{support_request_id}": {
      get: {
        tags: ["Support Requests"],
        summary: "Get full details of a Support Project",
        parameters: [
          { name: "support_request_id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Project details" } }
      }
    },
    "/api/setSupportProjectOwnerAndCode": {
      put: {
        tags: ["Support Requests"],
        summary: "Set project owner and code for Support Project",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                support_request_id: 1,
                project_code: "A2I-SUP-001",
                project_owner: "EMP123"
              }
            }
          }
        },
        responses: { 200: { description: "Code and owner assigned" } }
      }
    },
    "/api/mergeSupportProcess": {
      put: {
        tags: ["Support Requests"],
        summary: "Merge Support Request into another",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                source_id: 2,
                target_id: 1,
                remarks: "Merged duplicate support ticket"
              }
            }
          }
        },
        responses: { 200: { description: "Requests merged" } }
      }
    },
    "/api/uploadSupportProjectDocument": {
      post: {
        tags: ["Support Requests"],
        summary: "Upload document or link to a Support Project",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  spa_id: { type: "string", description: "Support Project Assigned ID" },
                  link: { type: "string", description: "Optional URL/link" },
                  files: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                    description: "Files (PDF, DOC, XLS, PNG, JPG up to 5MB)"
                  }
                },
                required: ["spa_id"]
              }
            }
          }
        },
        responses: { 200: { description: "Document uploaded" } }
      }
    },
    "/api/deleteSupportProjectDocument": {
      put: {
        tags: ["Support Requests"],
        summary: "Delete document or link from Support Project",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                spa_id: "1",
                file_name: "ticket_details.pdf",
                link_only: false
              }
            }
          }
        },
        responses: { 200: { description: "Document deleted" } }
      }
    },
    "/api/updateSupportProgressPercentage": {
      put: {
        tags: ["Support Requests"],
        summary: "Update Support Project progress percentage",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                spa_id: 1,
                progress_percentage: 100
              }
            }
          }
        },
        responses: { 200: { description: "Progress updated" } }
      }
    },

    // -------------------------------------------------------------
    // MESSAGES & NOTES
    // -------------------------------------------------------------
    "/api/addNote": {
      post: {
        tags: ["Messages & Notes"],
        summary: "Add a note or send chat message to a request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                request_id: 1,
                request_type: "innovation",
                sender_type: "user",
                emp_id: "EMP123",
                emp_name: "John Doe",
                message: "Here is the latest architecture diagram for review"
              }
            }
          }
        },
        responses: { 200: { description: "Note added" } }
      }
    },
    "/api/getMessages": {
      get: {
        tags: ["Messages & Notes"],
        summary: "Get chat messages and notes for a request",
        parameters: [
          { name: "request_id", in: "query", required: true, schema: { type: "string" } },
          { name: "request_type", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "List of messages" } }
      }
    },
    "/api/markAsSeen": {
      post: {
        tags: ["Messages & Notes"],
        summary: "Mark messages as read/seen",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                request_id: 1,
                request_type: "innovation",
                emp_id: "EMP123",
                emp_name: "John Doe"
              }
            }
          }
        },
        responses: { 200: { description: "Messages marked as seen" } }
      }
    },
    "/api/unreadCount": {
      get: {
        tags: ["Messages & Notes"],
        summary: "Get unread messages count for an employee",
        parameters: [
          { name: "emp_id", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Unread count" } }
      }
    },

    // -------------------------------------------------------------
    // COMMENTS & REACTIONS
    // -------------------------------------------------------------
    "/api/addComment": {
      post: {
        tags: ["Comments & Reactions"],
        summary: "Add comment to a request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                request_id: 1,
                request_type: "innovation",
                emp_id: "EMP123",
                emp_name: "John Doe",
                comment: "Great initiative! We can leverage this in our team as well."
              }
            }
          }
        },
        responses: { 200: { description: "Comment added" } }
      }
    },
    "/api/getCommentsWithReactionsAndReplies": {
      get: {
        tags: ["Comments & Reactions"],
        summary: "Get comments with reactions and nested replies",
        parameters: [
          { name: "request_id", in: "query", required: true, schema: { type: "string" } },
          { name: "request_type", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Comments with reactions and replies" } }
      }
    },
    "/api/addReaction": {
      post: {
        tags: ["Comments & Reactions"],
        summary: "Add or toggle reaction on a request (Like, Love, Clap, etc.)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                request_id: 1,
                request_type: "innovation",
                emp_id: "EMP123",
                reaction_type: "like"
              }
            }
          }
        },
        responses: { 200: { description: "Reaction toggled" } }
      }
    },
    "/api/getReactionCounts": {
      get: {
        tags: ["Comments & Reactions"],
        summary: "Get reaction counts for a request",
        parameters: [
          { name: "request_id", in: "query", required: true, schema: { type: "string" } },
          { name: "request_type", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: { 200: { description: "Reaction counts" } }
      }
    },
    "/api/addCommentReaction": {
      post: {
        tags: ["Comments & Reactions"],
        summary: "Add or toggle reaction on a specific comment",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                comment_id: 1,
                emp_id: "EMP123",
                reaction_type: "like"
              }
            }
          }
        },
        responses: { 200: { description: "Comment reaction toggled" } }
      }
    },
    "/api/addCommentReply": {
      post: {
        tags: ["Comments & Reactions"],
        summary: "Reply to a specific comment",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                comment_id: 1,
                emp_id: "EMP123",
                emp_name: "John Doe",
                reply: "Agreed, let us schedule a sync."
              }
            }
          }
        },
        responses: { 200: { description: "Reply added" } }
      }
    },

    // -------------------------------------------------------------
    // DASHBOARD
    // -------------------------------------------------------------
    "/api/getAllStatusCount": {
      get: {
        tags: ["Dashboard"],
        summary: "Get overall status counts across all categories",
        responses: { 200: { description: "Status counts summary" } }
      }
    },
    "/api/getRequestCountMonthWise": {
      get: {
        tags: ["Dashboard"],
        summary: "Get month-wise request submission trends",
        responses: { 200: { description: "Month-wise counts" } }
      }
    },
    "/api/getAllDetails": {
      get: {
        tags: ["Dashboard"],
        summary: "Get detailed summary of requests across all modules",
        responses: { 200: { description: "Detailed dashboard data" } }
      }
    },

    // -------------------------------------------------------------
    // USER MANAGEMENT
    // -------------------------------------------------------------
    "/api/getAllInnovationRoles": {
      get: {
        tags: ["User Management"],
        summary: "Get list of all assigned innovation roles",
        responses: { 200: { description: "List of users with roles" } }
      }
    },
    "/api/updateUserRole": {
      post: {
        tags: ["User Management"],
        summary: "Assign or update a user's role",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                emp_id: "EMP123",
                role: "Admin"
              }
            }
          }
        },
        responses: { 200: { description: "User role updated" } }
      }
    },
    "/api/updateUserRoleStatus": {
      post: {
        tags: ["User Management"],
        summary: "Activate or deactivate a user role status",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                emp_id: "EMP123",
                status: "Active"
              }
            }
          }
        },
        responses: { 200: { description: "User status updated" } }
      }
    },
    "/api/permanentDeleteUserRole": {
      post: {
        tags: ["User Management"],
        summary: "Permanently remove a user role assignment",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                emp_id: "EMP123"
              }
            }
          }
        },
        responses: { 200: { description: "User role removed" } }
      }
    },
    "/api/getAllactiveAhanaEmplist": {
      get: {
        tags: ["User Management"],
        summary: "Get all active employees from Ahana directory",
        responses: { 200: { description: "List of active employees" } }
      }
    },

    // -------------------------------------------------------------
    // REQUEST TRANSFER
    // -------------------------------------------------------------
    "/api/transferRequest": {
      post: {
        tags: ["Request Transfer"],
        summary: "Transfer request from one category to another",
        description: "Transfer between Innovation Lab, Automation Requests, AI Enthusiasts, and Support Requests with audit trail.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                request_id: 1,
                source_category: "Innovation",
                target_category: "Automation",
                transferred_by: "EMP123",
                remarks: "This idea is ready for direct automation workflow"
              }
            }
          }
        },
        responses: { 200: { description: "Request transferred successfully" } }
      }
    },
  },
};
