const core = require('@actions/core');
const axios = require('axios');

const WF_NAME = core.getInput('workflowName');
const TIMEOUT_MSEC = core.getInput('timeoutSec') * 1000;
const API_PATH = '/repos/' + core.getInput('repos') + '/actions/runs';
const INTERVAL_SEC = core.getInput('intervalSec');

const RETRY_COUNT = 10;

function owata_(promise) {
  return promise.catch(err => {
    core.setFailed(err.message);
    process.exit(-1);
  });
}

async function getWorkflowIds(status) {
  const res = await owata_(request(API_PATH, newConf(status), RETRY_COUNT));
  return res.data.workflow_runs
    .filter(wfr => !WF_NAME || wfr.name == WF_NAME)
    .map(wfr => wfr.id);
}

async function checkCompletion(ids) {
  return (await Promise
    .all(ids.map(id => owata_(getWorkflowStatus(id)))))
    .every(s => s == 'completed');
}

async function getWorkflowStatus(id) {
  const path = API_PATH + '/' + id;
  const res = await owata_(request(path, newConf(), RETRY_COUNT));
  console.log(id + ' - ' + res.data.status);
  return res.data.status;
}

async function request(path, config, count) {

  const res = await owata_(axios.get(path, config));

  if (res.status != 200)
    console.log('The http status that is response of Github REST API is not success, it is ' + res.status + '.');
  else if (res.data.total_count && res.data.total_count != res.data.workflow_runs.length)
    console.log('The response of Github REST API contains a mismatch between [total_count:' + res.data.total_count + '] and [workflow_runs.length:' + res.data.workflow_runs.length + '].');
  else
    return res;

  if (count - 1 < 0)
    throw 'Github REST API did not return a valid response while retry count .';

  await sleep(0.5);
  return await owata_(request(path, config, count - 1));
}

function sleep(sec) {
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
}

function newConf(status) {

  const conf = {
    baseURL: 'https://api.github.com/',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: 'token ' + core.getInput('token')
    }
  };

  if (status)
    conf.params = { status: status };

  return conf;
}

async function run() {

  const ids = (await Promise
    .all(['queued', 'in_progress'].map(s => owata_(getWorkflowIds(s)))))
    .flatMap(arr => arr);
  if (ids.length == 0)
    return;

  let timeoutFlag = false;
  const start = new Date();

  while (!(await owata_(checkCompletion(ids))) && !timeoutFlag) {
    await sleep(INTERVAL_SEC);
    timeoutFlag = new Date() - start > TIMEOUT_MSEC;
  }

  if (timeoutFlag)
    core.setFailed('The workflow runs were not completed/started while timeoutSec.');
}

owata_(run());
