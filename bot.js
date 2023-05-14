// Project info:
/*
 */

//////////////
// Settings //
//////////////

const filter = false; // Turns the response speech filter on or off

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

// GPT4All
// Note that the gpt4all we are using has problems by default on windows, instructions for fix below:
// line 65: make sure there is a .exe extension like this -> "/.nomic/gpt4all.exe", this is only needed for some Windows users
const GPT = require('gpt4all').GPT4All;
const chat = new GPT('gpt4all-lora-unfiltered-quantized', true); // Default is 'gpt4all-lora-quantized' model

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
   await sleep(1); // Wait a second to make sure the chatbot is initialized, just in case
   await chat.init(); // Initialize and download missing files
   logInfo("Opening...");
   await chat.open(); // Open the connection with the model
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
   logInfo("AI shutting down...");

   // Make sure the modules are closed correctly
   chat.close();
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
            ask(PRIO_DEV, getInfo(prompt) + " " + prompt);
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

////////////////////
// Text To Speech //
////////////////////

function speak(message) {
   tasksQueue.speaking.push(message);
   if (!tasksBusy.speaking) { speakQueue(); }
}

function speakQueue() {
   tasksBusy.speaking = true;
   const msg = tasksQueue.speaking[0];
   tasksQueue.speaking.splice(0,1);
   say.speak(msg, null, 1.0, (err) => {
      if (err) { tasksBusy.speaking = false; console.error(err); }
      if (tasksQueue.speaking.length > 0) { speakQueue(); }
      else { tasksBusy.speaking = false; }
   });
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
   const response = await chat.prompt(prompt);
   console.timeEnd('response');
   logInfo(response);
   const result = cleanResponse(response);
   logInfo(result);
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

///////////////////////
// Voice recognition //
///////////////////////

// tasksBusy.listening = true;
// TODO-LATER: implement

////////////////////////
// Knowledge database //
////////////////////////

function getInfo(question) {
   // Check what modules are needed to answer this
   const keywords = unDupeList(toTextOnly(question).split(" "));
   let required = [];
   for (let i = 0; i < keywords.length; i++) {
      for (let j = 0; j < knowledge_modules.length; j++) {
         if (knowledge_modules[j].active) {
            if (hasModuleKnowledge(knowledge_modules[j].name, keywords[i])) {
               required.push({ name: keywords[i], module: knowledge_modules[j].name, requirements: getModuleKnowledgeDependencies(knowledge_modules[j].name, keywords[i]) });
               break;
            }
         }
      }
   }

   // Fill in the dependencies with fulfilled requirements
   let dependencies = [];
   let lastlength = -1;
   while(required.length !== lastlength) {
      lastlength = required.length;
      for (let i = 0; i < required.length; i++) {
         if (required[i].requirements.length === 0 || containsAllDependencies(dependencies, required[i].requirements)) {
            dependencies.push({ name: required[i].name, module: required[i].module });
            required.splice(i, 1);
            lastlength = required.length + 1;
         } else {
            for (let j = 0; j < required[i].requirements.length; j++) {
               if (containsDependency(dependencies, required[i].requirements[j])) { continue; }
               if (hasModuleKnowledge(required[i].module, required[i].requirements[j])) {
                  required.push({ name: required[i].requirements[j], module: required[i].module, requirements: getModuleKnowledgeDependencies(required[i].module, required[i].requirements[j]) });
                  lastlength = required.length + 1;
               }
            }
         }
      }
   }

   // Fill using the required list with things it couldn't figure out easily, so it is less likely to error
   if (required.length) { for (let i = 0; i < required.length; i++) { dependencies.push({ name: required[i].name, module: required[i].module }); } logError("Unable to fill all the requirements before adding last few items, they might be interlinked!"); logInfo(dependencies); }

   // Gather all the info in one place
   let result = "";
   for (let i = 0; i < dependencies.length; i++) { result += (result.length > 0 ? " " : "") + getModuleInfo(dependencies[i].module, dependencies[i].name); }
   return result;
}

function hasModuleKnowledge(module, knowledge) {
   const directoryEntries = fs.readdirSync("knowledge/" + module, { withFileTypes: true });
   for (let i = 0; i < directoryEntries.length; i++) {
      if (directoryEntries[i].isFile() && directoryEntries[i].name.endsWith(filetype)) {
         if (equalsCaseSensitive(directoryEntries[i].name.substring(0, directoryEntries[i].name.length - filetype.length), knowledge)) { return true; }
      }
   }
   return false;
}

function getModuleInfo(module, knowledge) {
   const lines = readFromFile("knowledge/" + module + "/" + knowledge + filetype);
   let info = [];
   for (let i = 0; i < lines.length; i++) {
      const start = lines[i].split(" ")[0].toLowerCase();
      if (!equalsCaseSensitive(start, "require")) { info.push(lines[i]); }
   }
   return concatenate(info);
}

function getModuleKnowledgeDependencies(module, knowledge) {
   const lines = readFromFile("knowledge/" + module + "/" + knowledge + filetype);
   let result = [];
   for (let i = 0; i < lines.length; i++) {
      const params = lines[i].split(" ");
      if (equalsCaseSensitive(params[0].toLowerCase(), "require")) { result.push(concatenate(subList(params, 1))); }
   }
   return result;
}

function findModules() {
   let list = [];
   const directoryEntries = fs.readdirSync("knowledge", { withFileTypes: true });
   for (let i = 0; i < directoryEntries.length; i++) { if (directoryEntries[i].isDirectory()) { addModuleToList(directoryEntries[i].name, list); } }
   return list;
}

function addModuleToList(name, list, checked = false) { list.push({ name: name, active: checked ? checked : wasChecked(name) }); }

function wasChecked(name) {
   for (let i = 0; i < knowledge_modules.length; i++) {
      if (equalsCaseSensitive(knowledge_modules[i].name, name)) { return knowledge_modules[i].active; }
   }
   return false;
}

function containsAllDependencies(dependencies, required) {
   for (let i =0; i < required.length; i++) { if (!containsDependency(dependencies, required[i])) { return false; } }
   return true;
}

function containsDependency(dependencies, dependency) {
   for (let i = 0; i < dependencies.length; i++) { if (equalsCaseSensitive(dependencies[i].name, dependency)) { return true; } }
   return false;
}

///////////////////
// Control panel //
///////////////////

// Setup express for usage
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

// Set command interface through page get
app.get("/cmd/*", (req, res) => {
   if (tasksBusy.console) { parseCommand(req.url).catch((err) => { console.error(err); }); }
   sleep(0.05).then(() => { res.redirect("/"); }); // redirects back to the home page
});

// Set main page get implementation
app.get("/", (req, res) => { res.render("index", { modules: generateModulesHTML(), status: (program === null ? "<button onclick=\"command('start')\" type=\"button\">Start</button>" : "") }); });

// Start the server
const server = http.createServer(app);
server.listen(3000, () => { tasksBusy.console = true; });

// Used to kill the server
async function stopServer() { server.close((err) => { logError(err); }); logInfo("Shutting down..."); if (program !== null) { tasksBusy.console = false; await program; } process.exit(); }

function generateModulesHTML() {
   knowledge_modules = findModules();
   let result = "";
   for (let i = 0; i < knowledge_modules.length; i++) { result += "<input name=\"module\" type=\"checkbox\" value=\"" + knowledge_modules[i].name + "\"" + (knowledge_modules[i].active ? " checked" : "") + "/><label>" + knowledge_modules[i].name + "</label>"; }
   return result;
}

///////////
// Utils //
///////////

function findFirstCapitalCharacter(str) { return findCapitalCharacter(str, 0); }
function findCapitalCharacter(str, start) { for (let i = start; i < str.length; i++) { if (capitalCharacters.indexOf(str[i]) >= 0) { return i; } } return start; }
async function sleep(seconds) { return new Promise((resolve) => setTimeout(resolve, seconds * 1000)); }
function contains(list, item) { for (let i = 0; i < list.length; i++) { if (equalsCaseSensitive(list[i], item)) { return true; } } return false; }

function containsAll(list, all) {
   for (let i = 0; i < all.length; i++) { if (!contains(list, all[i])) { return false; } }
   return true;
}

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

function concatenate(list, start = 0, end = 0) {
   if (end === 0) { end = list.length; } else if (list.length) { end = Math.min(end + 1, list.length); } // Makes sure it doesn't go out of the arrays bounds
   let result = "";
   for (let i = start; i < end; i++) { result += (i !== start ? " " : "") + list[i]; }
   return result;
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

function reverseList(list) {
   let result = [];
   for (let i = list.length - 1; i > -1; i--) { result.push(list[i]); }
   return result;
}

function combineLists(one, two) {
   let result = [];
   for (let i = 0; i < one.length; i++) { result.push(one[i]); }
   for (let i = 0; i < two.length; i++) { result.push(two[i]); }
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