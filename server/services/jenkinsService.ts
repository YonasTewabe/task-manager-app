import axios from "axios";

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

export async function testConnection() {
  const config = getJenkinsConfig();
  const configError = validateConfig(config);
  if (configError) {
    const error = new Error(configError);
    (error as any).statusCode = 400;
    throw error;
  }
  const response = await axios.get(`${cleanBase(config.baseUrl)}/api/json`, {
    ...withAuth(config),
    timeout: 10000,
  });
  return {
    success: true,
    message: "Jenkins server is reachable",
    status: response.status,
    data: response.data,
  };
}

export async function triggerJob(payload: any = {}) {
  const config = getJenkinsConfig();
  const configError = validateConfig(config);
  if (configError) {
    const error = new Error(configError);
    (error as any).statusCode = 400;
    throw error;
  }
  if (!config.jobName) {
    const error = new Error("JENKINS_JOB_NAME is not configured.");
    (error as any).statusCode = 400;
    throw error;
  }
  const triggerUrl = `${cleanBase(config.baseUrl)}/job/${config.jobName}/buildWithParameters?token=${encodeURIComponent(config.triggerToken)}`;
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(payload || {})) {
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
  return {
    success: true,
    message: "Jenkins job triggered",
    status: triggerResp.status,
    location: triggerResp.headers?.location || null,
    response: triggerResp.data || null,
  };
}
