require('dotenv').config();

//////////////
// Settings //
//////////////

// Configurable settings in memory
let filter = process.env.DEFAULT_FILTER === "TRUE";

const FILTERED = [ // A list of all the words that should be filtered if the filter is turned on
    "test",
];

let game = ""; // to keep track of which game is selected

/////////////
// Program //
/////////////

// Priority types for usage when you connect it to a chat with viewers or some other chat sort
const PRIO_DEV = "dev";
const PRIO_USER = "user";

// Priorities for prompt ordering
const PRIORITIES = [
    PRIO_DEV,
    PRIO_USER,
];

// Sources
const SOURCE_CONSOLE = "console";
const SOURCE_DISCORD = "discord";
const SOURCE_TWITCH = "twitch";

// Response character filtering
const capitalCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const characters = capitalCharacters.toLowerCase() + " ";
const normalCharacters = characters + capitalCharacters;
const specialCharacters = ".,:;[]!?(){}=-+<>~|*%^&$#@!|`\'\"/\\";
const numbers = "0123456789";
const allowedCharacters = capitalCharacters + normalCharacters + specialCharacters + numbers;

// Async runners
let programRunner = null
let promptRunner = null;
let consoleRunning = false;
let promptRunning = false;

// Queue's
let promptQueue = [];

// Initialized?
let initialized = false;

//////////////////
// Dependencies //
//////////////////

// Console
const http = require('http');
const express = require('express');
const APIChatGPT = require("openai");
const app = express();

// OpenAI's ChatGPT
const configuration = new APIChatGPT.Configuration({
    organization: process.env.OPENAI_ORG,
    apiKey: process.env.OPENAI_KEY,
});
const openai = new APIChatGPT.OpenAIApi(configuration);

//////////////
// Bot mind //
//////////////

async function init() {
    logInfo("Initializing...");

    // Load OpenAI ChatGPT connection
    const response = await openai.listEngines();
    if (response.status !== 200) { logError("Failed to initialize good connection with OpenAI's ChatGPT! exiting!"); parseCommand(['cmd', 'stop']); return; }
    else { logInfo("Managed to connect to OpenAI's ChatGPT!") }

    logInfo("Initialized!");
    initialized = true;
}

function isBusy() { return promptRunner || consoleRunning; }

async function start() {
    await init(); // Make sure the modules are initialized correctly

    while (isBusy()) { await sleep(1); } // Loop until finished

    // Make sure the modules are closed correctly
    programRunner = null;
}

async function awaitInit() { while (!initialized) { await sleep(1) } }

async function parseCommand(cmd) {
    const params = cmd.substring(1,cmd.length).split("\/");
    logInfo(params);
    if (equalsCaseSensitive(params[0], "cmd")) {
        switch (params[1]) {
            case "ask":
                const prompt = concatenate(params, 2);
                ask(PRIO_DEV, "Do not use any known info other than the info given in this prompt. " + prompt);
                break;
            case "start":
                if (programRunner === null) { programRunner = start(); }
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
    promptQueue.push( { author: author, prompt: prompt, spoken: spoken} );
    if (!promptRunning) { askQueue().then(() => {}); }
    logInfo("Added question");
}

async function askQueue() {
    promptRunning = true;

    // Make sure the AI is active
    if (programRunner === null) { programRunner = start(); }
    if (!initialized) { await awaitInit(); }

    // Process all the queued prompts
    let current = 0;
    while(promptQueue.length > 0) {
        current = getHighestQueueByPriority();
        await chatPrompt(promptQueue[current].prompt, promptQueue[current].spoken);
        promptQueue.splice(current, 1);
    }
    promptRunning = false;
}

async function chatPrompt(prompt, spoken) {
    logInfo(`Prompt: ${prompt}`);
    console.time('response');
    const messages = [{ role: "user", content: prompt }];
    const completion = await openai.createChatCompletion({  model: "gpt-3.5-turbo-1106", messages: messages }).catch(err => { console.log(err); return});
    console.timeEnd('response');
    if (completion.status !== 200) { logError(completion.data.error.message); return; }
    const response = completion.data.choices[0].message.content;
    const result = filterResponse(cleanResponse(response));
    logInfo(`Response: ${result}`);
}

function getHighestQueueByPriority() {
    let topPrio = 1000000000;
    let top = 0;
    for (let i = 0; i < promptQueue.length; i++) {
        const prio = PRIORITIES.indexOf(promptQueue[i].author);
        if (prio === 0) { return i; }
        if (prio < topPrio) {
            topPrio = prio;
            top = i;
        }
    }
    return top;
}

// Used to filter the responses if the setting is turned on so that it can be used in situations where the AI is not allowed to say certain things
function filterResponse(response) {
    if (filter) {
        if (containsFromList(response, FILTERED, true)) {
            // TODO: replace all the wrong words
        }
    }
    return response;
}

// used to make sure the response from the GPT doesn't contain invalid characters
// TODO-LATER: check if this is still needed since this is a leftover from the random characters gpt4all would give at the start of a response
function cleanResponse(response) {
    let result = "";
    for (let i = 0; i < response.length; i++) { if (allowedCharacters.indexOf(response[i]) >= 0) { result += response[i]; } }
    return result.substring(findFirstCapitalCharacter(result), result.length);
}

///////////////////
// Control panel //
///////////////////

// Setup express for usage
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

// Set command interface through page get
app.get("/cmd/*", (req, res) => {
    if (consoleRunning) { parseCommand(req.url).catch((err) => { console.error(err); }); }
    sleep(0.05).then(() => { res.redirect("/"); }); // redirects back to the home page
});

// Set main page get implementation
app.get("/", (req, res) => { res.render("index", { status: (programRunner === null ? "<button onclick=\"command('start')\" type=\"button\">Start</button>" : "") }); });

// Start the server
const server = http.createServer(app);
server.listen(3000, () => { consoleRunning = true; });

// Used to kill the server
async function stopServer() { server.close((err) => { logError(err); }); logInfo("Shutting down..."); if (programRunner !== null) { consoleRunning = false; await programRunner; } process.exit(); }

///////////
// Utils //
///////////

function concatenate(list, start = 0, end = 0) {
    if (end === 0) { end = list.length; } else if (list.length) { end = Math.min(end + 1, list.length); } // Makes sure it doesn't go out of the arrays bounds
    let result = "";
    for (let i = start; i < end; i++) { result += (i !== start ? " " : "") + list[i]; }
    return result;
}

function findFirstCapitalCharacter(str) { return findCapitalCharacter(str, 0); }

function findCapitalCharacter(str, start) { for (let i = start; i < str.length; i++) { if (capitalCharacters.indexOf(str[i]) >= 0) { return i; } } return start; }

function equalsCaseSensitive(first, second) {
    switch(first) {
        case second: return true;
        default: return false;
    }
}

function contains(list, item) { for (let i = 0; i < list.length; i++) { if (equalsCaseSensitive(list[i], item)) { return true; } } return false; }

function containsFromList(txt, list, ignoreCase = false) {
    for (let i = 0; i < list.length; i++) {
        if (txt.indexOf(list[i])) { return true; }
        else if (ignoreCase) { if (txt.toLowerCase().indexOf(list[i].toLowerCase())) { return true; } }
    }
    return false;
}

function toTextOnly(msg) {
    let result = "";
    for (let i = 0; i < msg.length; i++) { if (contains(normalCharacters, msg[i])) { result += msg[i]; } }
    return result;
}

async function sleep(seconds) { return new Promise((resolve) => setTimeout(resolve, seconds * 1000)); }

function logInfo(msg) { console.log(msg); }

function logError(msg) { console.error("Error: ", msg); }