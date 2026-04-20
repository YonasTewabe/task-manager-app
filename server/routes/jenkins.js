import express from "express";
import axios from "axios";

const router = express.Router();

function cleanBase(url) {
  return String(url || "").replace(/\/+$/, "");
}

function getJenkinsConfig() {
  return {
    baseUrl: cleanBase(process.env.JENKINS_BASE_URL),
    user: process.env.JENKINS_USER,
    password: process.env.JENKINS_PASSWORD,
    jobName: process.env.JENKINS_JOB_NAME,
    triggerToken: process.env.JENKINS_TRIGGER_TOKEN || "",
  };
}

function jenkinsApiJsonUrl(baseUrl) {
  return `${cleanBase(baseUrl)}/api/json`;
}

function jenkinsBuildWithParamsUrl(baseUrl, jobName) {
  return `${cleanBase(baseUrl)}/job/${jobName}/buildWithParameters`;
}

function withAuth(config) {
  return {
    auth: {
      username: config.user,
      password: config.password,
    },
  };
}

function validateConfig(config) {
  if (!config.baseUrl || !config.user || !config.password) {
    return "Jenkins credentials are incomplete. Set JENKINS_BASE_URL, JENKINS_USER and JENKINS_PASSWORD.";
  }
  return null;
}

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Jenkins routes are working",
    timestamp: new Date().toISOString(),
  });
});

// Test Jenkins connectivity
router.get("/test-connection", async (req, res) => {
  try {
    const config = getJenkinsConfig();
    const configError = validateConfig(config);
    if (configError) {
      return res.status(400).json({ success: false, message: configError });
    }
    const response = await axios.get(jenkinsApiJsonUrl(config.baseUrl), {
      ...withAuth(config),
      timeout: 10000,
    });

    res.json({
      success: true,
      message: "Jenkins server is reachable",
      status: response.status,
      data: response.data,
    });
  } catch (error) {
    console.error("Jenkins connectivity test failed:", error);
    res.status(500).json({
      success: false,
      message: "Jenkins server is not reachable",
      error: error.message,
      code: error.code,
    });
  }
});

async function triggerJenkinsJob(req, res) {
  try {
    const config = getJenkinsConfig();
    const configError = validateConfig(config);
    if (configError) {
      return res.status(400).json({ success: false, message: configError });
    }
    if (!config.jobName) {
      return res.status(400).json({
        success: false,
        message: "JENKINS_JOB_NAME is not configured.",
      });
    }

    const triggerUrl = `${jenkinsBuildWithParamsUrl(config.baseUrl, config.jobName)}?token=${encodeURIComponent(config.triggerToken)}`;
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(req.body || {})) {
      if (value !== undefined && value !== null) {
        form.set(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    }

    const triggerResp = await axios.post(triggerUrl, form.toString(), {
      ...withAuth(config),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      timeout: 30000,
    });

      res.json({
        success: true,
        message: "Jenkins job triggered",
        status: triggerResp.status,
        location: triggerResp.headers?.location || null,
        response: triggerResp.data || null,
      });
  } catch (error) {
    console.error("Error triggering Jenkins job:", error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.statusText || error.message,
      details: error.response?.data || null,
    });
  }
}

router.post("/trigger-job", triggerJenkinsJob);

export default router;
