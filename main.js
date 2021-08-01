const core = require('@actions/core');
const axios = require('axios');

const RETRY_COUNT = 3;
const INTERVAL_SEC = 3;

async function workflowIsRunning(repos, config, workflowName) {
  let a = await workflowIsRunning(repos, config, workflowName, 'queued');
  let b = await workflowIsRunning(repos, config, workflowName, 'in_progress');
  console.log('queued -> ' + a);
  console.log('in_progress -> ' + b);
  return a || b;
}

async function workflowIsRunning(repos, config, workflowName, status) {
  config.params.status = status;
  console.log(config);
  const res = await request(repos, config, RETRY_COUNT);
  return res.data.total_count != 0
    && (!workflowName || res.data.workflow_runs.some(wfr => wfr.name == workflowName));
}

async function request(repos, config, count) {

  const res = await axios.get('/repos/' + repos + '/actions/runs', config);
  if (res.status != 200)
    if (--count < 0)
      throw 'Github API did not return 200.';
    else
      return await request(repos, config, --count);

  return res;
}

function sleep(sec) {
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
}

async function run() {

  const repos = core.getInput('repos');
  const timeoutSec = core.getInput('timeoutSec');
  const workflowName = core.getInput('workflowName');
  const token = core.getInput('token');

  const config = {
    baseURL: 'https://api.github.com/',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: 'token ' + token
    },
    params: {
      status: ''
    }
  };

  let timeoutFlag = false;
  const start = new Date();
  while (await workflowIsRunning(repos, config, workflowName) && !timeoutFlag) {
    await sleep(INTERVAL_SEC)
    timeoutFlag = new Date() - start > timeoutSec * 1000;
  }

  if (timeoutFlag)
    core.setFailed('The workflow runs were not completed while timeoutSec.');
}

try {
  run();
} catch (error) {
  core.setFailed(error.message);
}
