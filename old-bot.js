// Project info:
/*
 */

//////////////
// Settings //
//////////////

const filter = false; // Turns the response speech filter on or off

// Message when no info on a subject can be found
const NO_INFO = "No info on the subjects could be found...";

// Priority types for usage when you connect it to a chat with viewers or some other chat sort
const PRIO_DEV = "dev";
const PRIO_CHAT = "chat";

// Priorities for prompt ordering
const PRIORITIES = [
    PRIO_DEV,
    PRIO_CHAT,
];

// Filtering
const filteredMessage = "*Filtered*";
const FILTERED = [
    "test",
];

////////////////////////////////
// Memory for running the bot //
////////////////////////////////

// Knowledge database
const fs = require('fs');
const filetype = ".knowledge";

// Console
const http = require('http');
const express = require('express');
const app = express();
let knowledge_modules = [];

// Chat GPT
const API_KEYS = readFromFile("API_KEYS/settings.txt");
console.log(API_KEYS);
const APIChatGPT = require('openai');
const configuration = new APIChatGPT.Configuration({
    organization: API_KEYS[1],
    apiKey: API_KEYS[0],
});
const openai = new APIChatGPT.OpenAIApi(configuration);

// Text To Speech
const say = require('say');
let voicesList = [];
function getVoices() { return new Promise((resolve) => { say.getInstalledVoices((err, voice) => { if (err) { console.error(err); } return resolve(voice); }) }) }
async function usingVoices() { voicesList = await getVoices(); logInfo(voicesList) }

const capitalCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const characters = capitalCharacters.toLowerCase() + " ";
const normalCharacters = characters + capitalCharacters;
const specialCharacters = ".,:;[]!?(){}=-+<>~|*%^&$#@!|`\'\"/\\";
const numbers = "0123456789";
const allowedCharacters = capitalCharacters + normalCharacters + specialCharacters + numbers;

// Queue's and busy booleans for all different parts
let tasksBusy  = { speaking: false, thinking: false, listening: false, console: false };
let tasksQueue = { speaking: []   , thinking: []   , listening: []   , console: []    };
let program = null;
let initialized = false;

////////////////////////
// Streamer companion //
////////////////////////

async function init() {
    logInfo("Initializing...");

    const response = await openai.listEngines();
    if (response.status !== 200) { logError("Failed to initialize good connection with OpenAI's ChatGPT! exiting!"); parseCommand(['cmd', 'stop']); return; }
    else { logInfo("Managed to connect to OpenAI's ChatGPT!") }

    logInfo("Voices:");
    await usingVoices();
    logInfo("Initialized!");
    initialized = true;
}

// Used to check if the AI interface and speaking interface are meant to be kept alive
function isBusy() { return tasksBusy.speaking || tasksBusy.thinking || tasksBusy.listening || tasksBusy.console; }

async function start() {
    await init(); // Make sure the modules are initialized correctly

    while (isBusy()) { await sleep(1); } // Loop until finished

    // Make sure the modules are closed correctly
    program = null;
}

async function awaitInit() { while (!initialized) { await sleep(1) } }

async function parseCommand(cmd) {
    const params = cmd.substring(1,cmd.length).split("\/");
    logInfo(params);
    if (equalsCaseSensitive(params[0], "cmd")) {
        switch (params[1]) {
            case "ask":
                const prompt = concatenate(params, 2);
                const info = getInfo(prompt);
                if (!equalsCaseSensitive(info, NO_INFO)) {
                    ask(PRIO_DEV, info + " Do not use any known info other than the info given in this prompt. " + prompt);
                } else {
                    logError("No info could be given since the AI has no info about this topic!");
                }
                break;
            case "say":
                speak(concatenate(params, 2));
                break;
            case "modules":
                const tmp = subList(params, 2);
                knowledge_modules = findModules();
                for (let i = 0; i < knowledge_modules.length; i++) { knowledge_modules[i].active = contains(tmp, knowledge_modules[i].name); }
                break;
            case "start":
                if (program === null) { program = start(); }
                break;
            case "stop":
                await stopServer();
                break;
            default:
                break;
        }
    }
}

/////////
// GPT //
/////////

function ask(author, prompt, spoken = true) {
    tasksQueue.thinking.push( { author: author, prompt: prompt, spoken: spoken} );
    if (!tasksBusy.thinking) { askQueue().then(() => {}); }
    logInfo("Added question");
}

async function askQueue() {
    tasksBusy.thinking = true;

    // Make sure the AI is active
    if (program === null) { program = start(); }
    if (!initialized) { await awaitInit(); }

    // Process all the queued prompts
    let current = 0;
    while(tasksQueue.thinking.length > 0) {
        current = getHighestQueueByPriority();
        await chatPrompt(tasksQueue.thinking[current].prompt, tasksQueue.thinking[current].spoken);
        tasksQueue.thinking.splice(current, 1);
    }
    tasksBusy.thinking = false;
}

async function chatPrompt(prompt, spoken) {
    logInfo(`Prompt: ${prompt}`);
    console.time('response');
    const messages = [{ role: "user", content: prompt }];
    const completion = await openai.createChatCompletion({  model: "gpt-3.5-turbo-1106", messages: messages }).catch(err => { console.log(err); return});
    console.timeEnd('response');
    if (completion.status !== 200) { logError(completion.data.error.message); return; }
    tokens -= completion.data.usage.total_tokens;
    const response = completion.data.choices[0].message.content;
    const result = cleanResponse(response);
    if (spoken) { speak(filterResponse(result)); }
    logInfo(`Response: ${result}`);
}

function getHighestQueueByPriority() {
    let topPrio = 1000000000;
    let top = 0;
    for (let i = 0; i < tasksQueue.thinking.length; i++) {
        const prio = PRIORITIES.indexOf(tasksQueue.thinking[i].author);
        if (prio === 0) { return i; }
        if (prio < topPrio) {
            topPrio = prio;
            top = i;
        }
    }
    return top;
}

// Used to filter the responses if the setting is turned on so that it can be used in situations where the AI is not allowed to say certain things
function filterResponse(response) { return (filter && containsFromList(response, FILTERED, true)) ? filteredMessage : response; }

// Used to clean the response from gpt4all since it usually includes some gibberish from piping the text to this application
function cleanResponse(response) {
    let result = "";
    for (let i = 0; i < response.length; i++) { if (allowedCharacters.indexOf(response[i]) >= 0) { result += response[i]; } }
    return result.substring(findFirstCapitalCharacter(result), result.length);
}

///////////
// Utils //
///////////

function findFirstCapitalCharacter(str) { return findCapitalCharacter(str, 0); }
function findCapitalCharacter(str, start) { for (let i = start; i < str.length; i++) { if (capitalCharacters.indexOf(str[i]) >= 0) { return i; } } return start; }
async function sleep(seconds) { return new Promise((resolve) => setTimeout(resolve, seconds * 1000)); }

function containsFromList(txt, list, ignoreCase = false) {
    for (let i = 0; i < list.length; i++) {
        if (txt.indexOf(list[i])) { return true; }
        else if (ignoreCase) { if (txt.toLowerCase().indexOf(list[i].toLowerCase())) { return true; } }
    }
    return false;
}

function equalsCaseSensitive(first, second) {
    switch(first) {
        case second: return true;
        default: return false;
    }
}


function subList(list, start = 0, end = -1) {
    if (end < 0) { end = list.length; }
    let result = [];
    for (let i = start; i < end; i++) { result.push(list[i]); }
    return result;
}

function unDupeList(list) {
    let result = [];
    for (let i =0; i < list.length; i++) { if (!contains(result, list[i])) { result.push(list[i]); } }
    return result;
}

function toTextOnly(msg) {
    let result = "";
    for (let i = 0; i < msg.length; i++) { if (contains(normalCharacters, msg[i])) { result += msg[i]; } }
    return result;
}

function logInfo(msg) { console.log(msg); }

function logError(msg) { console.error("Error: ", msg); }

function readFromFile(path) {
    try {
        const data = fs.readFileSync(path, 'utf8').split("\n");
        let lines = [];
        for (let i = 0; i < data.length; i++) {
            let line = data[i];
            if (line.endsWith("\r")) { line = line.substring(0, line.length - 1); } // Make sure lines don't end with the first half of the windows end line characters
            while (line.endsWith(" ")) { line = line.substring(0, line.length - 1); } // Make sure lines don't end with a space character
            if (line.length) { lines.push(line); }
        }
        return lines;
    } catch (err) {
        console.error(err);
        return [""];
    }
}